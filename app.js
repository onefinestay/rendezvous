var express = require('express');
var db = redis.createClient();
var app = express();

app.get('/', function(req, res){
  res.send("Let's rendezvous!");
});

app.listen(3000);
