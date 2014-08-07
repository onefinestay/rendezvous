var express = require('express');
var swig  = require('swig');
var config = require('./config');
var gcal = require('google-calendar');
var moment = require('moment');

var app = express();
var passport = require('passport');
var GoogleStategy = require('passport-google-oauth').OAuth2Strategy;

app.configure(function() {
	app.use(express.cookieParser());
	app.use(express.bodyParser());
	app.use(express.session({secret: 'SECRET HERE'}));
	app.use(passport.initialize());
})

var rooms = {  // TODO: autopopulate?
    1: {id: 1, cal_id: 'tintofs.com_43522d4e59432d31342d31322d4252@resource.calendar.google.com'}
};


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


function Event(data) {
    this.title = data.summary;
    this.confirmed = data.confirmed;
    this.start = moment(data.start.dateTime);
    this.end = moment(data.end.dateTime);
    this.attendees = [];

    for (var i=0; i<data.attendees.length; i++) {
        if (data.attendees[i].resource !== true) {
            this.attendees.push(data.attendees[i]);
        }
    }
}

Event.prototype.is_active = function() {
    var now = moment();
    return this.start.isBefore(now) && this.end.isAfter(now);
}



app.get('/room/:id/', function(req, res) {
    // gets the detail for the specified room
    if(!req.session.access_token) return res.redirect('/auth');

    //Create an instance from accessToken
    var accessToken     = req.session.access_token;
    var room            = rooms[req.params.id];

    gcal(accessToken).events.list(room.cal_id, {maxResults: 50}, function(err, data) {
        if(err) return res.send(500,err);

        var ev;
        var current_event;
        var schedule = [];

        console.log(schedule);
        for (var i=0; i<data.items.length; i++) {
            console.log('1');
            ev = Event(data.items[i]);
            console.log('2');
            console.log(data.items.length);
            if (ev.confirmed !== true) {
                console.log('3');
                schedule.push(ev);

                if (ev.is_active()) {
                    current_event = ev;
                }
            }
        }

        console.log(schedule);
        console.log('shouldn\'t be undefined');

        return res.send(render_template('templates/room_detail.html', {
            now: moment().format('dddd, Do MMM YYYY, hh:mm a'),
            room_name: data.summary,
            current_event: current_event,
            schedule: schedule
        }));
    });
});


var port = Number(process.env.PORT || 3000)
app.listen(port);

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
    res.redirect('/room/1/');
  });


/*
  ===========================================================================
                               Google Calendar
  ===========================================================================
*/

app.all('/cal', function(req, res){

  if(!req.session.access_token) return res.redirect('/auth');

  //Create an instance from accessToken
  var accessToken = req.session.access_token;

  gcal(accessToken).calendarList.list(function(err, data) {
    if(err) return res.send(500,err);
    return res.send(data);
  });
});

app.all('/cal/:calendarId', function(req, res){

  if(!req.session.access_token) return res.redirect('/auth');

  //Create an instance from accessToken
  var accessToken     = req.session.access_token;
  var calendarId      = req.params.calendarId;

  gcal(accessToken).events.list(calendarId, {maxResults:1}, function(err, data) {
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


app.all('/cal/:calendarId/:eventId', function(req, res){

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

