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

    gcal(accessToken).events.list(room.cal_id, {
        maxResults: 100,
        timeMin: moment(1, 'days').subtract().toISOString()
    }, function(err, data) {
        if(err) return res.send(500,err);

        var now = moment.utc().tz(GMT);
        var room_data = schedule_for_room(data);
        var start_time = moment(now).minutes(0).seconds(0).millisecond(0).subtract(1, 'hours');

        var offset = moment.duration(15 - (now.minutes() % 15), 'minutes');
        var adhoc_defaults = [15, 30, 60];
        var adhoc_times = [];

        for (var i=0;i<adhoc_defaults.length;i++) {
            var len = adhoc_defaults[i];
            var meeting_finish = moment(now).add(offset, 'minutes')
                                            .add(moment.duration(len, 'minutes'))
                                            .seconds(0).millisecond(0);

            if (!room_data.next_event ||
                meeting_finish.isBefore(room_data.next_event.start) ||
                meeting_finish.isSame(room_data.next_event.start))
            {
                adhoc_times.push(meeting_finish);
            }
        }

        return res.send(render_template('templates/busyroom.html', {
            room: room,
            start_time: start_time,
            current_event: room_data.current_event,
            next_event: room_data.next_event,
            schedule: calculate_schedule(room_data.schedule, start_time),
            adhoc_times: adhoc_times
        }));
    });
});


app.get('/room/:name/book/:end', function(req, res) {
    if(!req.session.access_token) return res.redirect('/auth');

    //Create an instance from accessToken
    var accessToken     = req.session.access_token;
    var calendarId      = rooms[req.params.name].cal_id;
    var now             = moment.utc().tz(GMT).seconds(0).millisecond(0).toISOString();
    var end             = req.params.end

    var event = {
        'summary': 'Ad-hoc meeting',
        'start'  : {'dateTime': now},
        'end'    : {'dateTime': end},
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
        return res.redirect('/room/' + req.params.name + '/');
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


function get_next_meeting_label(accessToken, cal_id, callback) {
    gcal(accessToken).events.list(cal_id, {
        maxResults: 10,
        timeMin: new Date().toISOString()
    }, function(err, data) {
        var label = 'Nothing!';
        if (data.items.length > 0) {
            label = data.items[0]['summary']
        }
        callback(label);
    });
}


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

        get_next_meeting_label(accessToken, room.cal_id, function(next_label) {
            return res.send(render_template('templates/in-progress.html', {
                now: moment().format('dddd, Do MMM YYYY, hh:mm a'),
                room: room,
                room_name: data.summary,
                current_event: current_event,
                schedule: schedule,
                room_in_use: current_event !== undefined,
                next_meeting_label: next_label
            }));
        })
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

            get_next_meeting_label(accessToken, room.cal_id, function(next_label) {

                return res.send({
                    next_meeting_label: next_label
                });
            })
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

require('./cal_api')(app, gcal);

app.listen(port);
