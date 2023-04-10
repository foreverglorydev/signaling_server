var sockets = require('./sockets'),
    yetify = require('yetify'),
    config = require('getconfig'),
    static = require('node-static'),
    port = parseInt(process.env.PORT || config.server.port, 10),
    path = require('path'),
    fs = require('fs');

var server_handler = function (req, res) {
    // Cross Origin for ipapi.co
    //res.setHeader("Access-Control-Allow-Origin", "ipapi.co");
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With");

    //Trim arguments
    var url = req.url.split('?')[0];

    var splitted = url.split('/');
    
    var roomName = splitted[1] || "";
    var peerId = splitted[2] || "";

    var content;
    var fs = require('fs');
    
    // VVB: Todo: forwarding of *.css to css/*.css, *.js -> js/*.js
    if (req.url.indexOf(".css") != -1 || req.url.indexOf(".js") != -1) {
        fileServer.serve(req, res);
        res.setHeader("Cache-Control", "no-cache, must-revalidate");
    }
    else {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });

        if( roomName.toLowerCase() == 'streamer' ) {
            content = fs.readFileSync(path.resolve(__dirname, './public/html/Streamer.html'));
        } else if (roomName == 'WebStreamerRoom')
        {
            content = fs.readFileSync(path.resolve(__dirname, './public/html/Preview_web.html'));
        }
        else if (roomName.toLowerCase() == 'duplex')
        {
            content = fs.readFileSync(path.resolve(__dirname, './public/html/Duplex.html'));
        }
        else if (roomName.toLowerCase() == 'janus')
        {
            content = fs.readFileSync(path.resolve(__dirname, './public/html/Preview_Janus.html'));
        }
        else {   
            content = fs.readFileSync(path.resolve(__dirname, './public/html/Preview.html'));
        }

        res.end(content);
    }
};

var server = null;
var fileServer = new static.Server(path.resolve(__dirname, './public'), { cache: false });

// Create an http(s) server instance to that socket.io can listen to
if (config.server.secure) {
    server = require('https').Server({
        key: fs.readFileSync(path.resolve(__dirname, ".", config.server.key)),
        cert: fs.readFileSync(path.resolve(__dirname, ".", config.server.cert)),
        passphrase: config.server.password
    }, server_handler);
} else {
    console.log("Just https availible");
    process.exit(1);
}

server.listen(port);

sockets.ListenSocket(server, config, function (res) {
    server.close(function () {
        console.log("closed");
        process.exit(0);
    });
});

if (config.uid) process.setuid(config.uid);

var httpUrl = "https://localhost:" + port;
console.log(yetify.logo() + ' -- signal master is running at: ' + httpUrl);