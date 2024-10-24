const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');

// Create express app
const app = express();

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/podstream', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB:', err));

// Set the view engine
app.set('view engine', 'ejs');

// Middlewares
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// User model
const User = require('./models/User');

// Render login and signup pages
app.get('/', (req, res) => {
    res.render('login');
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

// Handle signup logic
app.post('/signup', async (req, res) => {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({
        email,
        password: hashedPassword
    });
    
    user.save()
        .then(() => res.redirect('/'))
        .catch(err => res.status(500).send('Error saving user to the database.'));
});

// Handle login logic
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
        return res.status(400).send('Invalid email or password.');
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(400).send('Invalid email or password.');
    }

    res.send('Logged in successfully');
});

// Server listening on port 5000
const port = 5000;
app.listen(port, () => {
    console.log(`Server running on port: ${port}`);
});
