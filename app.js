var express = require('express');
var swig  = require('swig');
var app = express();


app.get('/', function(req, res){
    var template = swig.compileFile('templates/index.html');
    var output = template({
        project_name: 'Rendezvous',
    });
    res.send(output);
});

var port = Number(process.env.PORT || 3000)
app.listen(port);
