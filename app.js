var async = require('async');
var express = require('express');
var swig  = require('swig');
var config = require('./config');
var gcal = require('google-calendar');
var moment = require('moment-timezone');
var bodyParser = require('body-parser');

var app = express();
var passport = require('passport');
var GoogleStategy = require('passport-google-oauth').OAuth2Strategy;

var port = Number(process.env.PORT || 3000);
app.use(bodyParser());

app.configure(function() {
	app.use(express.cookieParser());
	app.use(express.bodyParser());
	app.use(express.session({secret: 'SECRET HERE'}));
	app.use(passport.initialize());
})

// that and use Express's caching instead, if you like:
app.set('view cache', false);
// To disable Swig's cache, do the following:
swig.setDefaults({ cache: false });

var GMT = "Europe/London";

var rooms = {  // TODO: autopopulate?
    'boardroom': {
        id: 'boardroom',
        name: 'The Boardroom',
        location: '300 SJS',
        cal_id: 'tintofs.com_43522d4e59432d31342d31322d4252@resource.calendar.google.com'
    },
    'study': {
        id: 'study',
        name: 'The Study',
        location: '300 SJS',
        cal_id: 'tintofs.com_2d3838353536353633313930@resource.calendar.google.com'
    },
    'drawingroom': {
        id: 'drawingroom',
        name: 'The Drawing Room',
        location: '300 SJS',
        cal_id: 'tintofs.com_2d3938353839353535393236@resource.calendar.google.com'
    },
};


function render_template(template_path, context) {
    return swig.compileFile(template_path)(context);
}


function Event(data) {
    
    this.title = data.summary;
    this.confirmed = data.confirmed;
    this.start = moment.utc(data.start.dateTime).tz(GMT);
    this.end = moment.utc(data.end.dateTime).tz(GMT);
    this.minutes = this.end.diff(this.start, 'minutes');
    this.attendees = [];
    this.status = 'busy';

    for (var i=0; i<data.attendees.length; i++) {
        attendee =  data.attendees[i]
        if (attendee.resource !== true) {
            if (attendee.organizer == true) {
                this.owner = attendee.displayName;
            } else {
                this.attendees.push(attendee.displayName);
            }
        }
    }
}

Event.prototype.is_active = function() {
    var now = moment.utc();
    return this.start.isBefore(now) && this.end.isAfter(now);
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

app.post('/room/:id', function(req, res) {
    req.session.lastUrl = req.originalUrl;
    if(!req.session.access_token) return res.redirect('/auth');

    var meetingLength = req.body.meetingLength;
    console.log('Meeting Length:' + meetingLength);

	//Create an instance from accessToken
	var accessToken     = req.session.access_token;

    var room            = rooms[req.params.id];
	var calendarId      = room.cal_id;

    var event = {
        'summary': 'Test03',
        'start': {
            'dateTime': moment().toISOString()
        },
        'end': {
            'dateTime': moment().add(meetingLength, 'minutes')
        },
        'attendees': [
            {
                'email': calendarId // the user from the URL
            },
            {
                'email': req.session.gmail_address  // the logged in user
            }
        ]
    };

	gcal(accessToken).events.insert(calendarId, event, function(err, result) {
        console.log(err);
        console.log(result);
        return res.send('done');
        return res.redirect('/room/' + req.params.id + '/');
    });

})

function schedule_for_room(data) {
    var current_event;
    var next_event;
    var schedule = [];

    var now = moment.utc();

    for (var i=0; i<data.items.length; i++) {
        var ev;
        try {
            ev = new Event(data.items[i]);
        } catch (e) {
            // malformed data
        }

        if (ev.confirmed !== true) {
            schedule.push(ev);

            if (ev.start.isBefore(now) && ev.end.isAfter(now)) {
                current_event = ev;
            }
            else if (!next_event && ev.start.isAfter(now)) {
                next_event = ev;
            }
        }
    }

    return {
        current_event: current_event,
        next_event: next_event,
        schedule: schedule
    }
}

function calculate_schedule(schedule, anchor) {
    var new_schedule = [];
    if (!schedule) return new_schedule;

    for (var i=0; i<schedule.length; i++) {
        var ev = schedule[i];
        ev.from_start = ev.start.diff(anchor, 'minutes');
        new_schedule.push(ev)
    }

    return new_schedule;
}

app.get('/room/:name/', function(req, res) {
    // gets the detail for the specified room
    req.session.lastUrl = req.originalUrl;
    if(!req.session.access_token) return res.redirect('/auth');

    //Create an instance from accessToken
    var accessToken     = req.session.access_token;
    var room            = rooms[req.params.name];

    gcal(accessToken).events.list(room.cal_id, {maxResults: 50}, function(err, data) {
        if(err) return res.send(500,err);

        var now = moment.utc().tz(GMT);
        var room_data = schedule_for_room(data);
        var start_time = now.minutes(0).seconds(0).millisecond(0).subtract(1, 'hours');

        return res.send(render_template('templates/busyroom.html', {
            room: room,
            start_time: start_time,
            current_event: room_data.current_event,
            next_event: room_data.next_event,
            schedule: calculate_schedule(room_data.schedule, start_time)
        }));
    });
});


app.get('/free_rooms', function(req, res) {

    if(!req.session.access_token) return res.redirect('/auth');

    //Create an instance from accessToken
    var accessToken     = req.session.access_token;
    var room            = rooms[req.params.name];
    var free_rooms      = [];

    async.map(
        Object.keys(rooms),
        function(item, callback) {
            var room = rooms[item];

            gcal(accessToken).events.list(room.cal_id, {maxResults: 50}, function(err, data) {
                if(err) return res.send(500,err);

                var room_data = schedule_for_room(data);
                var obj = {
                    'name': room.name,
                    'location': room.location
                };
                if (room_data.next_event) {
                    // if tomorrow?
                    obj['available_until'] = room_data.next_event.start.format('HH:mm');
                }
                if (!room_data.current_event) {
                    callback(null, obj);
                } else {
                    callback(null, null)
                }

            });
        },
        function(err, results) {
            var free_rooms = [];

            for (var i=0;i<results.length;i++) {
                var result = results[i];
                if (result !== null) {
                    free_rooms.push(result);
                }
            }
            return res.send(free_rooms);
        }
    )
});


app.get('/room/:id/in-use', function(req, res) {
    // gets the detail for the specified room
    console.log('Original URL' + req.originalUrl)
    req.session.lastUrl = req.originalUrl;
    if(!req.session.access_token) return res.redirect('/auth');

    //Create an instance from accessToken
    var accessToken     = req.session.access_token;
    var room            = rooms[req.params.id];

    gcal(accessToken).events.list(room.cal_id, {maxResults: 50}, function(err, data) {
        if(err) return res.send(500,err);

        var current_event;
        var schedule = [];

        for (var i=0; i<data.items.length; i++) {
            var ev;
            try {
                ev = new Event(data.items[i]);
            } catch (e) {
                // malformed data
                console.log(e);
            }

            if (ev.confirmed !== true) {
                schedule.push(ev);

                if (ev.is_active()) {
                    current_event = ev;
                }
            }
        }

        return res.send(render_template('templates/in-progress.html', {
            now: moment().format('dddd, Do MMM YYYY, hh:mm a'),
            room: room,
            room_name: data.summary,
            current_event: current_event,
            schedule: schedule,
            room_in_use: current_event !== undefined,
            // TODO get the actual next meeting label
            next_meeting_label: "Company Meeting 2014"
        }));
    });
});


app.post('/room/:id/in-use', function(req, res) {
    req.session.lastUrl = req.originalUrl;
    if(!req.session.access_token) return res.redirect('/auth');

    //Create an instance from accessToken
    var accessToken     = req.session.access_token;
    var room            = rooms[req.params.id];

    gcal(accessToken).events.list(room.cal_id, {maxResults: 50}, function(err, data) {
        if(err) return res.send(500,err);

        var current_event;
        var g_event;
        var schedule = [];

        for (var i=0; i<data.items.length; i++) {
            var ev;
            try {
                g_event = data.items[i];
                ev = new Event(data.items[i]);
            } catch (e) {
                // malformed data
                console.log(e);
            }

            if (ev.confirmed !== true) {
                schedule.push(ev);

                if (ev.is_active()) {
                    current_event = ev;
                    break;
                }
            }
        }

        if (current_event === undefined) {
            throw new Error();
        }

        var event_id = g_event['id'];
        g_event['end']['dateTime'] = moment().toISOString();

        gcal(accessToken).events.update(room.cal_id, event_id, g_event, function(err, result) {
            return res.send({
                // TODO get the actual next meeting label
                next_meeting_label: "Company Meeting 2014"
            });
        });
    });
});


passport.use(new GoogleStategy({
	clientID: config.consumer_key,
	clientSecret: config.consumer_secret,
	callbackURL: (process.env.URL || ("http://lvh.me:" + port)) + "/auth/callback",
	scope: ['openid', 'email', 'https://www.googleapis.com/auth/calendar']
},
function (accessToken, refreshToken, profile, done) {
	profile.accessToken = accessToken;
	return done(null, profile);
}))

app.get('/auth',
	passport.authenticate('google', {session:false}));

app.get('/auth/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  function(req, res) {
    req.session.access_token = req.user.accessToken;
    req.session.gmail_address = req.user.emails[0]['value']
    console.log('Session last URL ' + req.session.lastUrl)
    res.redirect(req.session.lastUrl || '/');
  });

app.get('/auth/success', function(request, response) {
  response.redirect(request.session.lastUrl || '/');
});


/*
  ===========================================================================
                               Google Calendar
  ===========================================================================
*/

app.all('/cal', function(req, res){
  req.session.lastUrl = req.originalUrl;
  if(!req.session.access_token) return res.redirect('/auth');

  //Create an instance from accessToken
  var accessToken = req.session.access_token;

  gcal(accessToken).calendarList.list(function(err, data) {
    if(err) return res.send(500,err);
    return res.send(data);
  });
});

app.all('/cal/:calendarId', function(req, res){
  req.session.lastUrl = req.originalUrl;
  if(!req.session.access_token) return res.redirect('/auth');

  //Create an instance from accessToken
  var accessToken     = req.session.access_token;
  var calendarId      = req.params.calendarId;

  gcal(accessToken).events.list(calendarId, {
  	maxResults:10,
  	timeMin: new Date().toISOString()
  }, function(err, data) {
    if(err) return res.send(500,err);

    console.log(data)
    if(data.nextPageToken){
      gcal(accessToken).events.list(calendarId, {maxResults:1, pageToken:data.nextPageToken}, function(err, data) {
        console.log(data.items)
      })
    }


    return res.send(data);
  });
});

app.all('/cal/:calendarId/add', function(req, res) {
    req.session.lastUrl = req.originalUrl;
	if(!req.session.access_token) return res.redirect('/auth');

	//Create an instance from accessToken
	var accessToken     = req.session.access_token;
	var calendarId      = req.params.calendarId;

    var event = {
        'summary': 'Test03',
        'start': {
            'dateTime': '2014-08-07T17:00:00Z'
        },
        'end': {
            'dateTime': '2014-08-07T17:05:00Z'
        },
        'attendees': [
            {
                'email': calendarId // the user from the URL
            },
            {
                'email': req.session.gmail_address  // the logged in user
            }
        ]
    };

	gcal(accessToken).events.insert(calendarId, event, function(err, result) {
        return res.send(result);
    });
});


app.all('/cal/:calendarId/:eventId', function(req, res){
  req.session.lastUrl = req.originalUrl;
  if(!req.session.access_token) return res.redirect('/auth');

  //Create an instance from accessToken
  var accessToken     = req.session.access_token;
  var calendarId      = req.params.calendarId;
  var eventId         = req.params.eventId;

  gcal(accessToken).events.get(calendarId, eventId, function(err, data) {
    if(err) return res.send(500,err);
    return res.send(data);
  });
});


// server

app.listen(port);
