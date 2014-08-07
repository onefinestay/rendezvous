var express = require('express');
var swig  = require('swig');
var config = require('./config');
var gcal = require('google-calendar');

var app = express();
var passport = require('passport');
var GoogleStategy = require('passport-google-oauth').OAuth2Strategy;

app.configure(function() {
	app.use(express.cookieParser());
	app.use(express.bodyParser());
	app.use(express.session({secret: 'SECRET HERE'}));
	app.use(passport.initialize());
})

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
    req.session.gmail_address = req.user.emails[0]['value']
    res.redirect('/cal');
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

