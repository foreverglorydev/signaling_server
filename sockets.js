var socketIO = require('socket.io'),
    uuid = require('node-uuid'),
    crypto = require('crypto'),
    janusSrc = require('./janus'),
    wowzaSrc = require('./wowza'),
    exports = module.exports = {};
W3CWebSocket = require('websocket').w3cwebsocket;

exports.ListenSocket = function (server, config) {
    var opts = {
        pingTimeout: config.server.pingTimeout,
        pingInterval: config.server.pingInterval
    };

    var io = socketIO.listen(server, opts);
    exports.io = io;

    io.sockets.on('connection', function (client) {
        client.resources = {
            screen: false,
            video: true,
            audio: false
        };

        //set nickname
        client.on('nickname', function (nickName) {
            if (!client.customProps)
                client.customProps = {};
            if (!nickName || nickName == client.customProps.nickName) return;
            client.customProps.nickName = nickName;
            console.log('Client Id:' + client.id + ' call: ' + 'nickname');
			console.log('Client Id:' + client.id + ' sets his name to: ' + nickName);
        });

        //set info
        client.on('setinfo', function (info) {
            //Try to parse in case we have a message from native client
            var infoParsed;
            if (info && typeof info === 'string')
                infoParsed = JSON.parse(info);
            else
                infoParsed = info;

            if (isRealStrProp(infoParsed, 'strongId'))
                delete infoParsed.strongId;

            if (isRealStrProp(infoParsed, 'id') && infoParsed.id != client.id) {
                if (isRealObj(io.sockets.adapter.nsp.connected[infoParsed.id])) {
                    //Client tries to set an existing id
                    client.invalidId = true;
                    client.emit('loginresult', { result: 'failed', cause: 'idExists' });
                }
                else {
                    delete io.sockets.adapter.nsp.connected[client.id];
                    client.id = infoParsed.id;
                    io.sockets.adapter.nsp.connected[client.id] = client;
                }
            }

            if (infoParsed) {
                client.customProps = {};

                for (var property in infoParsed) {
                    console.log('Client Id:' + client.id + ' property: ' + property + '='+infoParsed[property]);
					client.customProps[property] = infoParsed[property];
                }
            }

            //Inform onter peers about info changing
            notifyRoomMembers(client.room);

            console.log('Client Id:' + client.id + ' changed his info ' +
                client.customProps.vidEncoder + ' ' +
                client.customProps.vidBitrate + ' ' +
                client.customProps.audEncoder + ' ' +
                client.customProps.audBitrate + ' ');
				 console.log('Client Id:' + client.id + ' call: ' + 'setInfo');
        });

        client.on('getroommembers', function () {
            notifyRoomMembers(client.room);
			console.log('Client Id:' + client.id + ' call: ' + 'getRoomMembers');
        });

        // pass a message to another id
        client.on('message', function (details) {
            if (!details) return;
            
            //Try to parse in case we have a message from native client
            if (!details.to) {
                var result = JSON.parse(details);
                details = result;
            }

            //Check if this is a message to Janus server from publisher
            if (details.to && details.to == 'janus') {
                //This is a message to our Janus server
                if (client.janusConnection && client.janusConnection.janusPlugin) {
                    if (details.type == 'offer') {
                        var publish = { "request": "configure", "audio": true, "video": true, "data":true };
                        client.janusConnection.janusPlugin.send({ "message": publish, "jsep": details.payload });
                    }
                    else if (details.type == 'candidate') {
                        var candidate = {
                            "candidate": details.payload.candidate.candidate,
                            "sdpMid": details.payload.candidate.sdpMid,
                            "sdpMLineIndex": details.payload.candidate.sdpMLineIndex
                        };
                        client.janusConnection.janusPlugin.sendTrickleCandidateFWD(client.janusConnection.janusPlugin.id, candidate);
                    }
                    else if (details.type == 'endOfCandidates') {
                        var candidate = {
                            completed: true
                        };
                        client.janusConnection.janusPlugin.sendTrickleCandidateFWD(client.janusConnection.janusPlugin.id, candidate);
                    }
                }
            }
            else if (details.to && details.type && details.type == 'januslistner') {
                //Peer wants to connect to janus streamer
                joinJanus(details.to, details.toName);
            }
            else if (details.to
                && client.customProps.multicastType
                && client.customProps.multicastType == 'wowza'
                && client.wowzaConnection
                && details.payload
                && details.payload.type == 'offer'
            ) {
                //Peer wants to connect to publish on wowza server
                client.wowzaConnection.wsSendOffer(client.customProps.nickName, details.payload);
            }

            var otherClient = io.sockets.adapter.nsp.connected[details.to];
            //Check if target client is Janus streamer and forward accordingly
            if (client.janusConnection && client.janusConnection.janusPlugin && client.janusConnection.remoteFeed && details.to != 'janus') {
                var remoteFeed = client.janusConnection.remoteFeed;
                if (details.type == 'answer') {
                    var body = { "request": "start", "room": client.janusConnection.myRoom };
                    remoteFeed.send({ "message": body, "jsep": details.payload });
                }
                else if (details.type == 'candidate') {
                    var candidate = {
                        "candidate": details.payload.candidate.candidate,
                        "sdpMid": details.payload.candidate.sdpMid,
                        "sdpMLineIndex": details.payload.candidate.sdpMLineIndex
                    };
                    remoteFeed.sendTrickleCandidateFWD(remoteFeed.id, candidate);
                }
                else if (details.type == 'endOfCandidates') {
                    var candidate = {
                        completed: true
                    };
                    remoteFeed.sendTrickleCandidateFWD(remoteFeed.id, candidate);
                }
            }

            if (!otherClient || !otherClient.id)
                return;

            if (!otherClient.customProps)
                otherClient.customProps = {};

            details.from = client.id;
            details.fromNickName = client.customProps.nickName;
            details.fromMode = client.customProps.mode;
            details.fromRoom = client.room;
            details.vidEncoder = client.customProps.vidEncoder;
            details.audEncoder = client.customProps.audEncoder;
            details.vidBitrate = client.customProps.vidBitrate;
            details.audBitrate = client.customProps.audBitrate;
            otherClient.emit('message', details);
			console.log('Client Id:' + client.id + ' call: ' + 'message');
            console.log('Client Id: ' + client.id + ' sends message to Id: ' + details.to + ' Type: ' + details.type);
        });

        client.on('shareScreen', function () {
            client.resources.screen = true;
        });

        client.on('unshareScreen', function (type) {
            client.resources.screen = false;
            removeFeed('screen');
        });
        client.on('time_req', function (time_req) {
            var infoParsed = {};
            if (time_req && typeof time_req === 'string')
                infoParsed = JSON.parse(time_req);
            else
                infoParsed = time_req;

            infoParsed['sync_time'] = Date.now().toString();  // In milliseconds from  1970/01/01
            if (isRealObj(client.room))
                infoParsed['current_room'] = client.room;

            // Check for room

            if (!isRealObj(client.room) ||
                !isRealObj(io.nsps['/'].adapter.rooms) ||
                !io.nsps['/'].adapter.rooms.hasOwnProperty(client.room) ||
                !io.nsps['/'].adapter.rooms[client.room].hasOwnProperty(client.id)) {
               client.emit('time_resp_not_in_room', infoParsed);

                return;
            }

            client.emit('time_resp', infoParsed);
			//console.log('Client Id:' + client.id + ' call: ' + 'time_resp');
        });
        client.on('join', join);

        function join(name, cb) {
            // sanity check
            if (typeof name !== 'string') return;
            // check if maximum number of clients reached
            if (config.rooms && config.rooms.maxClients > 0 &&
                clientsInRoom(name) >= config.rooms.maxClients) {
                safeCb(cb)('full');
                return;
            }
            // leave any existing rooms
            if (client.room != name)
                removeFeed();

            //Check if client has valid id
            if (client.invalidId)
                return;

            if (!client.customProps)
                client.customProps = {};
            client.customProps.nickName = client.customProps.nickName || '';
            client.customProps.mode = client.customProps.mode || '';

            safeCb(cb)(null, describeRoom(name));


            //Inform other peers about joininsg
            io.sockets.in(name).emit('memberjoined', {
                id: client.id,
                nickName: client.customProps.nickName,
                mode: client.customProps.mode
            });

            client.join(name);
            client.room = name;

            if (client.customProps.multicastType && client.customProps.multicastType.length > 0) {

                if (client.customProps.multicastType == 'janus') {
                    client.janusURL = '';
                    if (client.customProps.multicastServer && client.customProps.multicastServer.length > 0)
                        client.janusURL = client.customProps.multicastServer;
                    else if (config.janusservers && config.janusservers[0] && config.janusservers[0].url)
                        client.janusURL = config.janusservers[0].url;

                    //Join janus server
                    if (client.janusURL.length > 0) {
                        if (client.customProps.mode == 'sender') {
                            joinJanus('', '', {
                                connectionReady: function () {
                                    notifyRoomMembers(client.room);
                                }
                            });
                        }
                        else if (client.customProps.mode == 'receiver')
                            notifyRoomMembers(client.room);
                    }
                }

                if (client.customProps.multicastType == 'wowza') {
                    client.wowzaURL = '';
                    if (client.customProps.multicastServer && client.customProps.multicastServer.length > 0)
                        client.wowzaURL = client.customProps.multicastServer;
                    else if (config.wowzaservers && config.wowzaservers[0] && config.wowzaservers[0].url)
                        client.wowzaURL = config.wowzaservers[0].url;

                    client.wowzaConnection = new wowzaSrc.WowzaObj(client, {
                        connectionReady: function () {
                            notifyRoomMembers(client.room);
                        },
                        gotAnswer: function (answerSdp) {
                            var answerMsg = {
                                from: "wowza",
                                fromNickName: "wowza",
                                fromMode: "receiver",
                                fromRoom: client.room,
                                prefix: "webkit",
                                roomType: "video",
                                to: client.id,
                                type: "answer",
                                payload: answerSdp
                            };
                            client.emit('message', answerMsg);
                        },
                        gotCandidate: function (candidateSdp) {
                            var candidateMsg = {
                                from: "wowza",
                                fromNickName: "wowza",
                                fromMode: "receiver",
                                fromRoom: client.room,
                                prefix: "webkit",
                                roomType: "video",
                                to: client.id,
                                type: "candidate",
                                payload: { candidate: candidateSdp }
                            };
                            client.emit('message', candidateMsg);
                        }
                    });
                    client.wowzaConnection.wsConnect(client.wowzaURL);
                }
            }
            else {
                notifyRoomMembers(client.room);
            }
           console.log('Client Id:' + client.id + ' call: ' + 'joinRoom');
		   console.log('Client Id: ' + client.id + ' joins room: ' + name);
        }

        function joinJanus(targetPeerId, targetPeerName, callbacks) {
            if (client.joiningJanus && client.joiningJanus == true)
                return; //We are already joining

            client.joiningJanus = true;
            //Janus allow only numeric rooms
            client.customProps.mode = client.customProps.mode || '';
            if (client.customProps.mode == 'sender')
                client.janusRoom = Math.floor(new Date().valueOf() * Math.random());
            else if (client.customProps.mode == 'receiver' && targetPeerId) {
                var publisherClient = io.sockets.adapter.nsp.connected[targetPeerId];
                if (publisherClient && publisherClient.janusRoom)
                    client.janusRoom = publisherClient.janusRoom;
                if (publisherClient && publisherClient.janusURL)
                    client.janusURL = publisherClient.janusURL;
            }
            else
                return;

            //Try to connect to janus server
            janusSrc.JanusInit({
                debug: "all", callback: function () {
                    console.log('Janus connection initialized');
                }
            });

            var janusConnection = {
                janusURL: client.janusURL,
                janus: null,
                janusPlugin: null,
                janusMode: client.customProps.mode,
                opaqueId: client.id,
                myRoom: client.janusRoom,
                myUserName: client.customProps.nickName,
                videoCodec: client.customProps.vidEncoder,
                videoBitrate: parseInt(client.customProps.vidBitrate),
                myId: null,
                myStream: null,
                myPvtId: null,
                remoteFeed: null
            };

            // Create session
            janusConnection.janus = new janusSrc.JanusJanus(
                {
                    server: janusConnection.janusURL,
                    success: function () {
                        // Attach to video room test plugin
                        janusConnection.janus.attach(
                            {
                                plugin: "janus.plugin.videoroom",
                                opaqueId: janusConnection.opaqueId,
                                success: function (pluginHandle) {

                                    if (callbacks && callbacks.connectionReady)
                                        callbacks.connectionReady();

                                    cleanupJanus();
                                    client.joiningJanus = false;
                                    if (client.leaving && client.leaving == true) {
                                        janusConnection.janus.destroy(); //Client is leaving no need to handle janus stuff any more
                                        return;
                                    }

                                    janusConnection.janusPlugin = pluginHandle;
                                    client.janusConnection = janusConnection;
 
                                    console.log("Plugin attached! (" + janusConnection.janusPlugin.getPlugin() + ", id=" + janusConnection.janusPlugin.getId() + ")");
                                    console.log("  -- This is a publisher/manager");

                                    if (janusConnection.janusMode == 'sender') {
                                        createJanusRoom(janusConnection.myRoom, janusConnection.videoCodec, janusConnection.videoBitrate, janusConnection.janusPlugin, {
                                            success: function (data) {
                                                joinJanusRoom(janusConnection.myRoom, janusConnection.myUserName, janusConnection.janusPlugin);
                                            }
                                        });
                                    }
                                    else if (janusConnection.janusMode == 'receiver')
                                        joinJanusRoom(janusConnection.myRoom, janusConnection.myUserName, janusConnection.janusPlugin);
                                },
                                error: function (error) {
                                    console.error("  -- Error attaching plugin...", error);
                                    client.joiningJanus = false;
                                },
                                consentDialog: function (on) {
                                    console.log("Consent dialog should be " + (on ? "on" : "off") + " now");
                                },
                                mediaState: function (medium, on) {
                                    console.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium);
                                },
                                webrtcState: function (on) {
                                    console.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
                                },
                                onmessage: function (msg, jsep) {
                                    console.log(" ::: Got a message (publisher) :::");
                                    var event = msg["videoroom"];
                                    console.log("Event: " + event);
                                    if (event != undefined && event != null) {
                                        if (event === "joined") {
                                            // Publisher/manager created, negotiate WebRTC and attach to existing feeds, if any
                                            janusConnection.myId = msg["id"];
                                            janusConnection.myPvtId = msg["private_id"];
                                            console.log("Successfully joined room " + msg["room"] + " with ID " + janusConnection.myId);

                                            if (janusConnection.janusMode == 'sender')
                                                client.emit('loginjanusrequest', client.id);
                                            else if (janusConnection.janusMode == 'receiver') {
                                                //publishOwnFeed(true);
                                                // Any new feed to attach to?
                                                if (msg["publishers"] !== undefined && msg["publishers"] !== null) {
                                                    var list = msg["publishers"];
                                                    console.log("Got a list of available publishers/feeds:");
                                                    //console.log(list);
                                                    for (var f in list) {
                                                        var id = list[f]["id"];
                                                        var display = list[f]["display"];
                                                        console.log("  >> [" + id + "] " + display);
                                                        if (targetPeerId == id || targetPeerId == display || targetPeerName == id || targetPeerName == display) {
                                                            //this is our target peer. Lets listen to it
                                                            newRemoteFeed(id, display, targetPeerId, targetPeerName);
                                                        }
                                                    }
                                                }
                                            }
                                        } else if (event === "destroyed") {
                                            // The room has been destroyed
                                            console.warn("The room has been destroyed!");

                                        } else if (event === "event") {
                                            // Any new feed to attach to?
                                            if (msg["publishers"] !== undefined && msg["publishers"] !== null) {
                                                var list = msg["publishers"];
                                                console.log("Got a list of available publishers/feeds:");
                                                //console.log(list);
                                                for (var f in list) {
                                                    var id = list[f]["id"];
                                                    var display = list[f]["display"];
                                                    console.log("  >> [" + id + "] " + display);
                                                    //newRemoteFeed(id, display)
                                                }
                                            } else if (msg["leaving"] !== undefined && msg["leaving"] !== null) {
                                                // Publisher Left
                                                var leaving = msg["leaving"];
                                                console.log("Publisher left: " + leaving);

                                                //if (janusConnection.remoteFeed)
                                                //    janusConnection.remoteFeed.detach();
                                            } else if (msg["unpublished"] !== undefined && msg["unpublished"] !== null) {
                                                // One of the publishers has unpublished?
                                                var unpublished = msg["unpublished"];
                                                console.log("Publisher left: " + unpublished);
                                                if (unpublished === 'ok') {
                                                    // That's us
                                                    janusConnection.janusPlugin.hangup();
                                                    return;
                                                }
                                            } else if (msg["error"] !== undefined && msg["error"] !== null) {
                                                if (msg["error_code"] === 426) {
                                                    // This is a "no such room" error: give a more meaningful description
                                                } else { }
                                            }
                                        }
                                    }
                                    if (jsep !== undefined && jsep !== null) {
                                        console.log("Handling SDP as well...");
                                        //console.log(jsep);
                                        if (jsep.type == 'answer') {
                                            var answerMsg = {
                                                from: "janus",
                                                fromNickName: "janus",
                                                fromMode: "receiver",
                                                fromRoom: client.room,
                                                prefix: "webkit",
                                                roomType: "video",
                                                //sid: "2771400211",
                                                to: client.id,
                                                type: "answer",
                                                payload: jsep
                                            };
                                            client.emit('message', answerMsg);

                                        }
                                        //janusConnection.janusPlugin.handleRemoteJsep({ jsep: jsep });
                                    }
                                },
                                onlocalstream: function (stream) {
                                    console.log(" ::: Got a local stream :::");
                                    janusConnection.myStream = stream;
                                    //console.log(JSON.stringify(stream));
                                    var videoTracks = stream.getVideoTracks();
                                },
                                onremotestream: function (stream) {
                                    // The publisher stream is sendonly, we don't expect anything here
                                },
                                oncleanup: function () {
                                    console.log(" ::: Got a cleanup notification: we are unpublished now :::");
                                    janusConnection.myStream = null;
                                }
                            });
                    },
                    error: function (error) {
                        client.joiningJanus = false;
                        console.error(error);
                    },
                    destroyed: function () {
                        console.log(" ::: Plugin destroyed :::");
                    }
                });


            function newRemoteFeed(id, display, targetPeerId, targetPeerName) {
                // A new feed has been published, create a new plugin handle and attach to it as a listener
                var remoteFeed = null;
                janusConnection.janus.attach(
                    {
                        plugin: "janus.plugin.videoroom",
                        opaqueId: janusConnection.opaqueId,
                        success: function (pluginHandle) {
                            remoteFeed = pluginHandle;
                            remoteFeed.targetPeerId = targetPeerId;
                            remoteFeed.targetPeerName = targetPeerName;
                            remoteFeed.simulcastStarted = false;
                            console.log("Plugin attached! (" + remoteFeed.getPlugin() + ", id=" + remoteFeed.getId() + ")");
                            console.log("  -- This is a subscriber");
                            // We wait for the plugin to send us an offer
                            var listen = { "request": "join", "room": janusConnection.myRoom, "ptype": "listener", "feed": id, "private_id": janusConnection.myPvtId };
                            // In case you don't want to receive audio, video or data, even if the
                            // publisher is sending them, set the 'offer_audio', 'offer_video' or
                            // 'offer_data' properties to false (they're true by default), e.g.:
                            // 		listen["offer_video"] = false;
                            remoteFeed.send({ "message": listen });
                        },
                        error: function (error) {
                            console.log("  -- Error attaching plugin...", error);
                        },
                        onmessage: function (msg, jsep) {
                            console.log(" ::: Got a message (listener) :::");
                            //console.log(JSON.stringify(msg));
                            var event = msg["videoroom"];
                            console.log("Event: " + event);
                            if (msg["error"] !== undefined && msg["error"] !== null) {
                                console.log(msg["error"]);
                            } else if (event != undefined && event != null) {
                                if (event === "attached") {
                                    // Subscriber created and attached                                    
                                    janusConnection.remoteFeed = remoteFeed;
                                    console.log("Successfully attached to feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") in room " + msg["room"]);
                                } else if (event === "event") {
                                    // Check if we got an event on a simulcast-related event from this publisher
                                    var substream = msg["substream"];
                                    var temporal = msg["temporal"];
                                    if ((substream !== null && substream !== undefined) || (temporal !== null && temporal !== undefined)) {
                                        if (!remoteFeed.simulcastStarted) {
                                            remoteFeed.simulcastStarted = true;
                                        }
                                    }
                                } else {
                                    // What has just happened?
                                }
                            }
                            if (jsep !== undefined && jsep !== null) {
                                console.log("Handling SDP as well...");
                                //console.log(jsep);
                                //This is offer from janus server peer. Forward it to our client
                                if (jsep.type == 'offer') {
                                    var offerMsg = {
                                        from: targetPeerId,
                                        fromNickName: targetPeerName,
                                        fromRoom: client.room,
                                        prefix: "webkit",
                                        roomType: "video",
                                        //sid: "2771400212",
                                        to: client.id,
                                        type: "offer",
                                        payload: jsep
                                    };
                                    client.emit('message', offerMsg);
                                }
                            }
                        },
                        webrtcState: function (on) {
                            console.log("Janus says this WebRTC PeerConnection (feed #" + remoteFeed.rfindex + ") is " + (on ? "up" : "down") + " now");
                        },
                        onlocalstream: function (stream) {
                            // The subscriber stream is recvonly, we don't expect anything here
                        },
                        onremotestream: function (stream) {
                            console.log("Remote feed #" + remoteFeed.rfindex);

                        },
                        oncleanup: function () {
                            console.log(" ::: Got a cleanup notification (remote feed " + id + ") :::");
                            remoteFeed.simulcastStarted = false;
                        }
                    });
            }
        }

        function removeFeed(type) {
            if (client.room) {
                client.leaving = true;
                io.sockets.in(client.room).emit('remove', {
                    id: client.id,
                    type: type
                });
                if (!type) {
                    console.log('Client Id: ' + client.id + ' leaves room: ' + client.room);
                    client.leave(client.room);

                    //Inform other peers about leaving
                    io.sockets.in(client.room).emit('memberleaved', {
                        id: client.id,
                        nickName: client.customProps.nickName,
                        mode: client.customProps.mode
                    });

                    notifyRoomMembers(client.room);

                    client.room = undefined;

                    cleanupJanus();
                    if (client.janusRoom && client.customProps && client.customProps.mode == 'sender')
                        destroyJanusRoom(client.janusRoom);

                    if (client.wowzaConnection)
                        client.wowzaConnection.wsDisconnect();
                }
            }
        }

        function cleanupJanus() {
            if (client.janusConnection && client.janusConnection.janus) {
                client.janusConnection.janus.destroy();
                console.log('Janus  destroyed');
            }
        }

        // we don't want to pass "leave" directly because the
        // event type string of "socket end" gets passed too.
        client.on('disconnect', function () {
            removeFeed();
        });
        client.on('leave', function () {
            removeFeed();
        });

        client.on('create', function (name, cb) {
            if (arguments.length == 2) {
                cb = (typeof cb == 'function') ? cb : function () { };
                name = name || uuid();
            } else {
                cb = name;
                name = uuid();
            }
            // check if exists
            var room = io.nsps['/'].adapter.rooms[name];
            if (room && room.length) {
                safeCb(cb)('taken');
            } else {
                console.log('Room created: ' + name);
                join(name);
                safeCb(cb)(null, name);
            }
        });

        // support for logging full webrtc traces to stdout
        // useful for large-scale error monitoring
        client.on('trace', function (data) {
            console.log('trace', JSON.stringify(
                [data.type, data.session, data.prefix, data.peer, data.time, data.value]
            ));
        });


        // tell client about stun and turn servers and generate nonces
        client.emit('stunservers', config.stunservers || []);

        // create shared secret nonces for TURN authentication
        // the process is described in draft-uberti-behave-turn-rest
        var credentials = [];
        // allow selectively vending turn credentials based on origin.
        var origin = client.handshake.headers.origin;
        if (!config.turnorigins || config.turnorigins.indexOf(origin) !== -1) {
            config.turnservers.forEach(function (server) {
                                if (isRealStrProp(server, 'username') && isRealStrProp(server, 'credential')) {
                    credentials.push({
                        username: server.username,
                        credential: server.credential,
                        urls: server.urls || server.url
                    });
                }
                else if (isRealStrProp(server, 'secret')) {
                    var hmac = crypto.createHmac('sha1', server.secret);
                    // default to 86400 seconds timeout unless specified
                    var username = Math.floor(new Date().getTime() / 1000) + (server.expiry || 86400) + "";
                    hmac.update(username);
                    credentials.push({
                        username: username,
                        credential: hmac.digest('base64'),
                        urls: server.urls || server.url
                    });
                }
            });
        }
        var conDetails = [client.id, client.handshake.issued + '']
        client.emit('turnservers', credentials);
        client.emit('loggedin', conDetails)
        console.log('Client Id: ' + client.id + ' Connected to signaling');
        console.log(credentials);

        function destroyJanusRoom(roomName) {
            if (roomName.length === 0 || !client.janusURL)
                return;

            JanusSession = new janusSrc.JanusJanus({
                server: client.janusURL,
                success: function () {
                    JanusSession.attach(
                        {
                            plugin: "janus.plugin.videoroom",
                            opaqueId: janusSrc.JanusRandomString(12),
                            success: function (pluginHandle) {
                                var request = { "request": "exists", "room": roomName };
                                pluginHandle.send({
                                    "message": request, "success": function (data) {
                                        if (data && data.hasOwnProperty('exists') && data.exists == true) {
                                            request = { "request": "destroy", "room": roomName };
                                            pluginHandle.send({ "message": request });
                                        }
                                        CloseSession();
                                    },
                                    "error": function (data) {
                                        CloseSession();
                                    }
                                });
                                function CloseSession() {
                                    pluginHandle.hangup();
                                    JanusSession.destroy();
                                }
                            },
                            error: function (error) {
                                console.error(error);
                                JanusSession.destroy();
                            }
                        });
                },
                error: function (error) {
                    console.error(error);
                },
                destroyed: function () {

                }
            });
        }

        function createJanusRoom(roomName, videoCodec, videoBitrate, plugin, callbaks) {
            if (roomName.length === 0) {
                console.log('Empty room name');
            } else {
                // Try a registration
                if (/[^a-zA-Z0-9]/.test(roomName)) {
                    console.log('Room name contains illegal characters');
                }
                else if (plugin) {
                    videoCodec = videoCodec || 'vp8';
                    if (isNaN(videoBitrate))
                        videoBitrate = 2000000;
                    var request = { "request": "create", "room": roomName, "publishers": 1, "videocodec": videoCodec, "bitrate": videoBitrate };
                    plugin.send({ "message": request, "success": callbaks.success });
                }
            }
        }

        function joinJanusRoom(room, name, plugin) {
            if (name.length === 0) {
                console.log('Empty username');
            } else {
                // Try a registration
                if (/[^a-zA-Z0-9]/.test(name)) {
                    console.log('Username contains illegal characters');
                }
                else if (plugin) {
                    var request = { "request": "join", "room": room, "ptype": "publisher", "display": name };
                    //myUserName = name;
                    plugin.send({ "message": request });
                }
            }
        }
    });

    function describeRoom(name) {
        var adapter = io.nsps['/'].adapter;
        var clients = adapter.rooms[name] || {};
        var result = {
            clients: {}
        };
        Object.keys(clients).forEach(function (id) {
            result.clients[id] = adapter.nsp.connected[id].resources;
            var client_peer = result.clients[id];
            if (adapter.nsp.connected[id].customProps) {
                for (var property in adapter.nsp.connected[id].customProps) {
                    client_peer[property] = adapter.nsp.connected[id].customProps[property];
                }
            }
        });
        return result;
    }

    function notifyRoomMembers(room) {
        var result = {
            clients: []
        };
        thisroom = io.sockets.adapter.rooms[room];
        if (thisroom) {
            for (var id in thisroom) {

                var connectedPeer = io.sockets.adapter.nsp.connected[id];
                var info = {};
                info.id = connectedPeer.id;
                for (var property in connectedPeer.customProps) {
                    info[property] = connectedPeer.customProps[property];
                    //Backward compatibility with old "name"
                    if (property == 'nickName' || property == 'nickname')
                        info.name = connectedPeer.customProps[property];
                }

                result.clients.push(info);
            }
        }

        if (result.clients.length > 0)
            io.sockets.in(room).emit('roommembers', result);
    }

    function clientsInRoom(name) {
        return io.sockets.clients(name).length;
    }

    function isRealObj(obj) {
        return obj && obj !== 'null' && obj !== 'undefined';
    }

    function isRealProp(obj, prop) {
        return isRealObj(obj) && obj.hasOwnProperty(prop);
    }

    function isRealStrProp(obj, prop) {
        return isRealObj(obj) && obj.hasOwnProperty(prop) && typeof obj[prop] === 'string' && obj[prop].length > 0;
    }
};

function safeCb(cb) {
    if (typeof cb === 'function') {
        return cb;
    } else {
        return function () { };
    }
}
