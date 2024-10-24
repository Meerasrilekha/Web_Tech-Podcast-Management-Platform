const express = require("express");
const app = express();

app.get("/", function (req, res) {
  res.sendFile(__dirname + "/client.html");
});

app.listen(8000, function () {
  console.log("Listening on port 8000!");
});
