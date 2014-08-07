var express = require('express');
var swig  = require('swig');
var app = express();

var rooms = [  // TODO: autopopulate?
    {id: 1, name: 'Boardroom'}
];


function render_template(template_path, context) {
    return swig.compileFile(template_path)(context);
}

app.get('/', function(req, res){
    var template = swig.compileFile('templates/index.html');
    var output = template({
        project_name: 'Rendezvous',
    });
    res.send(output);
});


// views for generating the detail view
app.get('/room/', function(req, res) {
    // Returns a list of configured meeting rooms to select which room the
    // client is representing
    res.send(render_template('templates/rooms_list.html', {rooms: rooms}));
})


app.get('/room/:id/', function(req, res) {
    // gets the detail for the specified room
    res.send(render_template('templates/room_detail.html', {
        room: rooms[0],
        current_status: {
            event_title: 'Board Meeting',
            start_time: '12:00',
            end_time: '15:00',
            owner: 'Fergus Doyle',
            attendees: ['Fergus Doyle', 'Shaun Stanworth', 'Matt Bennett']
        },
        schedule: [
            {
                event_title: 'Board Meeting',
                start_time: '12:00',
                end_time: '15:00',
                owner: 'Fergus Doyle',
                attendees: ['Fergus Doyle', 'Shaun Stanworth', 'Matt Bennett']
            }, {
                event_title: 'Drinks',
                start_time: '18:00',
                end_time: '20:00',
                owner: 'Fergus Doyle',
                attendees: ['Fergus Doyle', 'Shaun Stanworth', 'Matt Bennett', 'Luis Visintini']
            },
        ]
    }));
})


var port = Number(process.env.PORT || 3000)
app.listen(port);
