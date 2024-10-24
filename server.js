const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const app = express();

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/podcastPlatform', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// Define user schema and model
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Video' }] // Array to store favorite videos
});
const User = mongoose.model('User', userSchema);

// Define video schema and model
const videoSchema = new mongoose.Schema({
    podcastName: String,
    category: String,
    filename: String,
    contentType: String,
    video: Buffer,
    views: { type: Number, default: 0 } // Track the number of views for each video
});
const Video = mongoose.model('Video', videoSchema);

// Set up multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const filetypes = /mp4|webm|mps/; // Allow mp4, webm, mps
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only .mp4, .webm, and .mps files are allowed!'));
        }
    },
});

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: 'podcastSecret', resave: false, saveUninitialized: false }));

// Input validation function
function validateInput(email, password) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const passwordMinLength = 6;
    return emailRegex.test(email) && password.length >= passwordMinLength;
}

// Define a new schema for statistics
const statsSchema = new mongoose.Schema({
    totalSignups: { type: Number, default: 0 },
    totalViews: { type: Number, default: 0 },
    signupHistory: [{ date: { type: Date, default: Date.now }, count: { type: Number, default: 0 } }] // Track daily signups
});

const Stats = mongoose.model('Stats', statsSchema);

// Ensure there's a stats entry in the database
async function initializeStats() {
    const statsCount = await Stats.countDocuments();
    if (statsCount === 0) {
        await Stats.create({ totalSignups: 0, totalViews: 0, signupHistory: [] });
    }
}
initializeStats();

// Signup route
app.post('/signup', async (req, res) => {
    const { email, password, role } = req.body;

    // Validate input
    if (!validateInput(email, password)) {
        return res.status(400).json({ message: 'Invalid email or password (must be at least 6 characters).' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword, role });

    try {
        await newUser.save();

        // Increment the total signups
        const stats = await Stats.findOne();
        stats.totalSignups += 1;

        // Update signup history
        const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
        const historyEntry = stats.signupHistory.find(entry => entry.date.toISOString().split('T')[0] === today);
        
        if (historyEntry) {
            historyEntry.count += 1; // Increment existing entry
        } else {
            stats.signupHistory.push({ date: new Date(), count: 1 }); // Add new entry for today
        }

        await stats.save(); // Save stats updates

        // Establish session after successful signup
        req.session.user = { email, role };
        res.status(200).json({ role });
    } catch (err) {
        res.status(500).json({ message: 'Error creating user. This email might already be registered.' });
    }
});

// Login route
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        // Check if user exists and compare password
        if (user && await bcrypt.compare(password, user.password)) {
            // Establish session after successful login
            req.session.user = { email, role: user.role, favorites: user.favorites };
            res.status(200).json({ role: user.role });
        } else {
            res.status(400).json({ message: 'Invalid email or password.' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Error logging in.' });
    }
});

// Account info display route
app.get('/account', (req, res) => {
    if (req.session.user) {
        res.json(req.session.user);
    } else {
        res.status(401).send('Not logged in');
    }
});

// Toggle favorite video for the logged-in user
app.post('/toggle-favorite/:videoId', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: 'You need to be logged in to favorite videos.' });
    }

    const userId = req.session.user.email;
    const videoId = req.params.videoId;

    try {
        const user = await User.findOne({ email: userId });

        // Check if the video is already in favorites
        if (user.favorites.includes(videoId)) {
            // Remove from favorites
            user.favorites = user.favorites.filter(id => id.toString() !== videoId);
        } else {
            // Add to favorites
            user.favorites.push(videoId);
        }

        await user.save();
        req.session.user.favorites = user.favorites; // Update session favorites
        res.status(200).json({ favorites: user.favorites });
    } catch (err) {
        res.status(500).json({ message: 'Error updating favorites.' });
    }
});

// Video upload route
app.post('/upload', upload.single('videoFile'), async (req, res) => {
    const { podcastName, category } = req.body;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }

    try {
        const newVideo = new Video({
            podcastName,
            category,
            filename: file.originalname,
            contentType: file.mimetype,
            video: file.buffer,
        });

        await newVideo.save();
        res.status(200).json({ message: 'Upload successful!' });
    } catch (err) {
        console.error('Error saving file to database:', err);
        res.status(500).json({ message: 'Error saving file to database.' });
    }
});

// API to get all videos (for featured podcasts)
app.get('/videos', async (req, res) => {
    try {
        const videos = await Video.find({}, 'filename podcastName _id');
        res.json(videos);
    } catch (err) {
        console.error('Error fetching videos:', err);
        res.status(500).send('Error fetching videos.');
    }
});

// API to get videos by category
app.get('/videos/:category', async (req, res) => {
    const category = req.params.category;
    try {
        const videos = await Video.find({ category }, 'filename podcastName _id');
        res.json(videos);
    } catch (err) {
        console.error('Error fetching videos:', err);
        res.status(500).send('Error fetching videos.');
    }
});

// GET route to serve video files
app.get('/video/:id', async (req, res) => {
    const videoId = req.params.id;

    try {
        const video = await Video.findById(videoId);
        if (!video) {
            return res.status(404).send('Video not found.');
        }

        // Increment the view count for the video
        video.views += 1;
        await video.save(); // Save the updated view count

        // Increment total views in statistics
        const stats = await Stats.findOne();
        stats.totalViews += 1;
        await stats.save(); // Save updated statistics

        res.contentType(video.contentType);
        res.send(video.video);
    } catch (err) {
        console.error('Error retrieving video:', err);
        res.status(500).send('Error retrieving video.');
    }
});

// Increment view count whenever the homepage is accessed
app.get('/', async (req, res) => {
    const stats = await Stats.findOne();
    stats.totalViews += 1;
    await stats.save();
    res.sendFile(path.join(__dirname, 'public', 'index.html')); // Change to your actual index file path
});

// Route to get the statistics
app.get('/stats', async (req, res) => {
    try {
        const stats = await Stats.findOne();
        res.json(stats); // This will return totalSignups, totalViews, and signupHistory
    } catch (err) {
        res.status(500).json({ message: 'Error retrieving statistics.' });
    }
});

// Start the server
app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
