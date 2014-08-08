module.exports = function (app, gcal) {

    /*
     ===========================================================================
     Google Calendar
     ===========================================================================
     */

    app.all('/cal', function (req, res) {
        req.session.lastUrl = req.originalUrl;
        if (!req.session.access_token) return res.redirect('/auth');

        //Create an instance from accessToken
        var accessToken = req.session.access_token;

        gcal(accessToken).calendarList.list(function (err, data) {
            if (err) return res.send(500, err);
            return res.send(data);
        });
    });

    app.all('/cal/:calendarId', function (req, res) {
        req.session.lastUrl = req.originalUrl;
        if (!req.session.access_token) return res.redirect('/auth');

        //Create an instance from accessToken
        var accessToken = req.session.access_token;
        var calendarId = req.params.calendarId;

        gcal(accessToken).events.list(calendarId, {
            maxResults: 10,
            timeMin: new Date().toISOString()
        }, function (err, data) {
            if (err) return res.send(500, err);

            console.log(data)
            if (data.nextPageToken) {
                gcal(accessToken).events.list(calendarId, {maxResults: 1, pageToken: data.nextPageToken}, function (err, data) {
                    console.log(data.items)
                })
            }


            return res.send(data);
        });
    });

    app.all('/cal/:calendarId/add', function (req, res) {
        req.session.lastUrl = req.originalUrl;
        if (!req.session.access_token) return res.redirect('/auth');

        //Create an instance from accessToken
        var accessToken = req.session.access_token;
        var calendarId = req.params.calendarId;

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

        gcal(accessToken).events.insert(calendarId, event, function (err, result) {
            return res.send(result);
        });
    });


    app.all('/cal/:calendarId/:eventId', function (req, res) {
        req.session.lastUrl = req.originalUrl;
        if (!req.session.access_token) return res.redirect('/auth');

        //Create an instance from accessToken
        var accessToken = req.session.access_token;
        var calendarId = req.params.calendarId;
        var eventId = req.params.eventId;

        gcal(accessToken).events.get(calendarId, eventId, function (err, data) {
            if (err) return res.send(500, err);
            return res.send(data);
        });
    });

}
