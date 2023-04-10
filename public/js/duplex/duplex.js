function getInputs() {
    return  [
       // "location",
       "publisherId",
        "clientName",
        "vidBitrate",
       "audBitrate",
        "vidEncoder",
        "input-options",
        "resolution-options",
        "mirror-options",
        "channels-options",
        "channels-other"
    ];
}

// -----------------------------------

const inputOptions = document.querySelector('select#input-options');
const mirrorOptions = document.querySelector('select#mirror-options');
const resolutionOptions = document.querySelector('select#resolution-options');
const videoCodecOptions = document.querySelector('select#vidEncoder');
const vidBitrateOption = document.querySelector('select#vidBitrate');

inputOptions.onchange = () => { reinit(); };
mirrorOptions.onchange = () => { reinit(); };
resolutionOptions.onchange = () => { reinit(); };
// videoCodecOptions.onchange = () => { reinit(); };
// vidBitrateOption.onchange = () => { reinit(); };

// ---------------------

var path = location.href;
var room = "duplex";
var videoEl = null;
var targetId = null;

if (path)
{
    var splitted = path.split('/');
    if (splitted.length >= 5) {
        signalingServer = splitted[0] + '//' + splitted[2];
        room = splitted[3];
        targetId =  splitted[4];
    }
}

var receiverConf = {
    'signalingServer': signalingServer,
    'targetId': targetId,
    'room': room,
	'duplex' : true
};

var receiverState = { 
    'webrtc': null,
    'videoEl': null,
};

var senderConf = {
	'signalingServer': signalingServer,
    'elName': 'selfee',
    'duplex': true
};

var senderState = { 
    'webrtc': null,
    'inputOptions': inputOptions,
    'mirrorOptions': mirrorOptions,
    'resolutionOptions': resolutionOptions,
    'videoCodecOptions': videoCodecOptions
};

$('#upd_button').click(function () {
		reinit();
    });

// ---------------------

const initDuplex = async () => {

    let oExtra = {
        target: receiverConf.targetId,
        url: receiverConf.signalingServer,
        stunServer: 'stun:stun.l.google.com:19302',
        autoRequestMedia: true,
        debug: false,
        detectSpeakingEvents: false,
        autoAdjustMic: false
    };

    senderConf.extra = oExtra;

    await initSender(senderConf, senderState); 
    receiverState.webrtc = senderState.webrtc;
	
	receiverState.webrtc.on('join_error', function(err) {
		// TODO: Make correct information about errors
		alert("VT Guest2 connection error - number of channels exceeded.", err);
	});
	
    await initReceiver(receiverConf, receiverState);
};

$(document).ready(() => initDuplex() );