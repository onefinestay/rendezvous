var express = require('express');
var swig  = require('swig');
var config = require('./config');
var gcal = require('google-calendar');
var moment = require('moment');
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

var rooms = {  // TODO: autopopulate?
    'boardroom': {
        name: 'boardroom',
        cal_id: 'tintofs.com_43522d4e59432d31342d31322d4252@resource.calendar.google.com'
    },
    'study': {
        name: 'study',
        cal_id: 'tintofs.com_2d3838353536353633313930@resource.calendar.google.com'
    },
    'drawingroom': {
        name: 'drawingroom',
        cal_id: 'tintofs.com_2d3938353839353535393236@resource.calendar.google.com'
    },
};


function render_template(template_path, context) {
    return swig.compileFile(template_path)(context);
}


function Event(data) {
    this.title = data.summary;
    this.confirmed = data.confirmed;
    this.start = moment.utc(data.start.dateTime);
    this.end = moment.utc(data.end.dateTime);
    this.minutes = this.end.diff(this.start, 'minutes');
    this.attendees = [];
    this.status = 'busy';

    for (var i=0; i<data.attendees.length; i++) {
        if (data.attendees[i].resource !== true) {
            this.attendees.push(data.attendees[i]);
        }
    }
}

Event.prototype.is_active = function() {
    var now = moment.utc();
    console.log('now', now);
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

    return {
        current_event: current_event,
        schedule: schedule
    }
}

function calculate_schedule(schedule, anchor) {
    var new_schedule = [];
    if (!schedule) return new_schedule;

    for (var i=0; i<schedule.length; i++) {
        var ev = schedule[i];
        console.log("calc sched", ev.start.toISOString(), anchor.toISOString())
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

        var now = moment.utc()
        var room_data = schedule_for_room(data);
        var start_time = now.minutes(0).seconds(0).millisecond(0).subtract(1, 'hours');

        return res.send(render_template('templates/busyroom.html', {
            now: now.format('dddd, Do MMM YYYY, hh:mm a'),
            room: room,
            room_name: req.params.name,
            start_time: start_time,
            current_event: room_data.current_event,
            schedule: calculate_schedule(room_data.schedule, start_time)
        }));
    });
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
            schedule: schedule
        }));
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


//demo page
app.get('/busyroom', function(req, res){

    var time = new Date()
    var start_hour = time.getHours() - 1;

    var template = swig.compileFile('templates/busyroom.html');
    var output = template({
        room_name: "The Study",
        current: {
            title: 'very long boring title That Just Keeps Going On And On And Seriously Really Long',
            description: 'Quick chat about something boring',
            start_time: '12:00',
            end_time: '23:30',
            owner: 'Fergus Doyle',
            attendees: ['Shaun Stanworth', 'Matt Bennett']
        },
        start_hour: start_hour,
        schedule: [
            {
                'status': 'busy',
                'title': 'event-0',
                'minutes': 15,
            },
            {
                'status': 'free',
                'title': 'event-1',
                'minutes': 30,
            },
            {
                'status': 'busy',
                'title': 'event-2',
                'minutes': 45,
            },
            {
                'status': 'free',
                'title': 'event-3',
                'minutes': 60,
            },
            {
                'status': 'busy',
                'title': 'event-4',
                'minutes': 80,
            },
            {
                'status': 'free',
                'title': 'event-5',
                'minutes': 70,
            }],
        project_name: 'Rendezvous',
    });
    res.send(output);
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
