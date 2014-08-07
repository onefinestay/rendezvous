var express = require('express');
var swig  = require('swig');
var app = express();

var rooms = [  // TODO: autopopulate?
    {id: 1, name: 'Boardroom'}
];


function render_template(template_path, context) {
    return swig.compileFile(template_path)(context);
}


app.use("/static", express.static(__dirname + '/static'));

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

app.get('/busyroom', function(req, res){

    var time = new Date()
    var start_hour = time.getHours() - 1;

    var template = swig.compileFile('templates/busyroom.html');
    var output = template({
        current: {
            title: 'Board Meeting',
            description: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
            start_time: '12:00',
            end_time: '15:00',
            owner: 'Fergus Doyle',
            attendees: ['Shaun Stanworth', 'Matt Bennett']
        },
        start_hour: start_hour,
        schedule: [
            {
                'length': 1,
                'status': 'busy',
                'title': 'event-0',
            },
            {'length': 2, 'status': 'free', 'title': 'event-1'},
            {'length': 3, 'status': 'busy', 'title': 'event-2'},
            {'length': 4, 'status': 'free', 'title': 'event-3'},
            {'length': 5, 'status': 'busy', 'title': 'event-4'},
            {'length': 5, 'status': 'free', 'title': 'event-5'}],
        project_name: 'Rendezvous',
    });
    res.send(output);
});

var port = Number(process.env.PORT || 3000)
app.listen(port);
