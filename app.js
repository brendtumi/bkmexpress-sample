var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var debug = require('debug')('bkmexpress.test:server');

var bkm = require('./routes/bkm');
var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', bkm);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    debug("404", {originalUrl: req.originalUrl, method: req.method, query: req.query, params: req.params, body: req.body});
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler
app.use(function (err, req, res, next) {
    var error = req.app.get('env') === 'development' ? err : {message: err.message};
    res.status(err.status || 500);

    setTimeout(function () {
        if (err.status !== 404)
            console.error("app.use error", err);
    }, 1000);

    res.json(error);
});

module.exports = app;
