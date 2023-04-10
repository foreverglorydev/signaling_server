var W3CWebSocket = require('websocket').w3cwebsocket;
var exports = module.exports = {};


function Wowza(client, callbacks) {
    this.wsConnection = null;
    this.streamInfo = { applicationName: "webrtc", streamName: "Stream", sessionId: "[empty]" };
    this.userData = { param1: "value1" };

    if (client.customProps && client.customProps.vidBitrate)
        this.videoBitrate = client.customProps.vidBitrate / 1000;
    if (client.customProps && client.customProps.audBitrate)
        this.audioBitrate = client.customProps.audBitrate / 1000;

    this.userAgent = null;
    this.newAPI = false;

    this.wsConnect = function(url) {
        this.wsConnection = new W3CWebSocket(url);
        this.wsConnection.binaryType = 'arraybuffer';

        this.wsConnection.onopen = function () {
            callbacks.connectionReady();
        }

        this.wsConnection.onmessage = function (evt) {
            console.log("wsConnection.onmessage: " + evt.data);

            var msgJSON = JSON.parse(evt.data);

            var msgStatus = Number(msgJSON['status']);
            var msgCommand = msgJSON['command'];

            if (msgStatus != 200) {
                console.log("Wowza rejected offer");
                this.wsDisconnect();
            }
            else {
                var sdpData = msgJSON['sdp'];
                if (sdpData !== undefined) {
                    console.log('sdp: ' + msgJSON['sdp']);
                    //Send answer
                    callbacks.gotAnswer(sdpData);
                }

                var iceCandidates = msgJSON['iceCandidates'];
                if (iceCandidates !== undefined) {
                    for (var index in iceCandidates) {
                        console.log('iceCandidates: ' + iceCandidates[index]);
                        //Send ice candidate
                        callbacks.gotCandidate(iceCandidates[index]);
                    }
                }
            }
        }

        this.wsConnection.onclose = function () {
            console.log("wsConnection.onclose");
        }

        this.wsConnection.onerror = function (evt) {
            console.log("wsConnection.onerror: " + JSON.stringify(evt));
        }
    }

    this.wsDisconnect = function () {
        if (this.wsConnection != null)
            this.wsConnection.close();
        this.wsConnection = null;
    }

    this.wsSendOffer = function (name, sdp) {
        if (this.wsConnection != null && sdp) {
            this.streamInfo.streamName = name;
            var payload = '{"direction":"publish", "command":"sendOffer", "streamInfo":' + JSON.stringify(this.streamInfo) + ', "sdp":' + JSON.stringify(sdp) + ', "userData":' + JSON.stringify(this.userData) + '}'
            this.wsConnection.send(payload);
        }
    }

    function gotDescription(description) {
        var enhanceData = new Object();
        if (audioBitrate !== undefined)
            enhanceData.audioBitrate = Number(audioBitrate);
        if (videoBitrate !== undefined)
            enhanceData.videoBitrate = Number(videoBitrate);
        if (videoFrameRate !== undefined)
            enhanceData.videoFrameRate = Number(videoFrameRate);


        description.sdp = enhanceSDP(description.sdp, enhanceData);

        console.log('gotDescription: ' + JSON.stringify({ 'sdp': description }));

        peerConnection.setLocalDescription(description, function () {

            wsConnection.send('{"direction":"publish", "command":"sendOffer", "streamInfo":' + JSON.stringify(streamInfo) + ', "sdp":' + JSON.stringify(description) + ', "userData":' + JSON.stringify(userData) + '}');

        }, function () { console.log('set description error') });
    }

    function enhanceSDP(sdpStr, enhanceData) {
        var sdpLines = sdpStr.split(/\r\n/);
        var sdpSection = 'header';
        var hitMID = false;
        var sdpStrRet = '';

        for (var sdpIndex in sdpLines) {
            var sdpLine = sdpLines[sdpIndex];

            if (sdpLine.length <= 0)
                continue;

            sdpStrRet += sdpLine;

            if (sdpLine.indexOf("m=audio") === 0) {
                sdpSection = 'audio';
                hitMID = false;
            }
            else if (sdpLine.indexOf("m=video") === 0) {
                sdpSection = 'video';
                hitMID = false;
            }
            else if (sdpLine.indexOf("a=rtpmap") == 0) {
                sdpSection = 'bandwidth';
                hitMID = false;
            }

            if (sdpLine.indexOf("a=mid:") === 0 || sdpLine.indexOf("a=rtpmap") == 0) {
                if (!hitMID) {
                    if ('audio'.localeCompare(sdpSection) == 0) {
                        if (enhanceData.audioBitrate !== undefined) {
                            sdpStrRet += '\r\nb=CT:' + (enhanceData.audioBitrate);
                            sdpStrRet += '\r\nb=AS:' + (enhanceData.audioBitrate);
                        }
                        hitMID = true;
                    }
                    else if ('video'.localeCompare(sdpSection) == 0) {
                        if (enhanceData.videoBitrate !== undefined) {
                            sdpStrRet += '\r\nb=CT:' + (enhanceData.videoBitrate);
                            sdpStrRet += '\r\nb=AS:' + (enhanceData.videoBitrate);
                            //if (enhanceData.videoFrameRate !== undefined) {
                            //    sdpStrRet += '\r\na=framerate:' + enhanceData.videoFrameRate;
                            //}
                        }
                        hitMID = true;
                    }
                    else if ('bandwidth'.localeCompare(sdpSection) == 0) {
                        var rtpmapID;
                        rtpmapID = getrtpMapID(sdpLine);
                        if (rtpmapID !== null) {
                            var match = rtpmapID[2].toLowerCase();
                            if (('vp9'.localeCompare(match) == 0) || ('vp8'.localeCompare(match) == 0) || ('h264'.localeCompare(match) == 0) ||
                                ('red'.localeCompare(match) == 0) || ('ulpfec'.localeCompare(match) == 0) || ('rtx'.localeCompare(match) == 0)) {
                                if (enhanceData.videoBitrate !== undefined) {
                                    sdpStrRet += '\r\na=fmtp:' + rtpmapID[1] + ' x-google-min-bitrate=' + (enhanceData.videoBitrate) + ';x-google-max-bitrate=' + (enhanceData.videoBitrate);
                                }
                            }

                            if (('opus'.localeCompare(match) == 0) || ('isac'.localeCompare(match) == 0) || ('g722'.localeCompare(match) == 0) || ('pcmu'.localeCompare(match) == 0) ||
                                ('pcma'.localeCompare(match) == 0) || ('cn'.localeCompare(match) == 0)) {
                                if (enhanceData.audioBitrate !== undefined) {
                                    sdpStrRet += '\r\na=fmtp:' + rtpmapID[1] + ' x-google-min-bitrate=' + (enhanceData.audioBitrate) + ';x-google-max-bitrate=' + (enhanceData.audioBitrate);
                                }
                            }
                        }
                    }
                }
            }
            sdpStrRet += '\r\n';
        }
        return sdpStrRet;
    }

    function getrtpMapID(line) {
        var findid = new RegExp('a=rtpmap:(\\d+) (\\w+)/(\\d+)');
        var found = line.match(findid);
        return (found && found.length >= 3) ? found : null;
    }
};
exports.WowzaObj = Wowza;
