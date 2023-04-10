function getInputs() {
    return  [
        "location",
        "publisherId",
        "clientName",
        "vidBitrate",
        "audBitrate",
        "vidEncoder",
        "input-options",
        "resolution-options",
        "mirror-options"
    ];
}

function parseUrl() {
    var path = location.href;

    if (path)
    {
        var splitted = path.split('/');

        // Have to be specified
        if (splitted[4] != null) {
			localStorage.setItem("publisherId", splitted[4]);
		} else {
			localStorage.setItem("publisherId", "WebStreamerRoom");
		}
			
        if (splitted[5]) clientId = splitted[5];
    }
}

function reStoreDataCustom() {
    var clientName = localStorage.getItem("clientName");
    if (clientName) 
        $('#clientName').val(clientName);
    else 
        $('#clientName').val("Guest" + Math.trunc(Math.random() * 10000));
}

function enableForm(enable) {
    var items = getInputs();

    items.forEach((item) => {
        $('#' + item).prop('disabled', !enable);
        $('#' + item).toggleClass("enabledInput", enable);
    });
}

function getConfig() {
    var oMedia = {};
    var oLocalVideo  = {muted: true};

    if (mirrorOptions.value == "0") {
        oLocalVideo["mirror"] = false;
    } else {
        oLocalVideo["mirror"] = true;
    }
    oMedia = {
        video: { 
            deviceId: cameras[inputOptions.value] 
        },
        audio: true
    };

    if (resolutionOptions.value != "default") {
        var resol = resolutions[resolutionOptions.value];
        oMedia.video.width = resol[0];
        oMedia.video.height = resol[1];
    }

    return {
        localVideoEl: 'localvid',
        autoRequestMedia: true,
        localVideo: oLocalVideo,
        media: oMedia
    }
}

function reinit() {
    storeData();
    window.location.reload(false);
}

function initCamera() {
    var constr = getConfig();
    wbertc = new SimpleWebRTC({...constr});
}

function start() {
    storeData();

    if (validateData()) {
        var constr = getConfig();

        webrtc = new SimpleWebRTC({
            ...constr,    
            stunServer: 'stun:stun.l.google.com:19302',
            detectSpeakingEvents: false,
            autoAdjustMic: false,
            url: signalingServer,
            receiveMedia: { offerToReceiveAudio: 0, offerToReceiveVideo: 0 }
        });

        var room = localStorage.getItem("publisherId");

        var peerInfo = {
            nickName:  localStorage.getItem("clientName"),
            vidEncoder: localStorage.getItem("vidEncoder"),
            audEncoder: "opus",
            vidBitrate: localStorage.getItem("vidBitrate"),
            audBitrate: localStorage.getItem("audBitrate"),
            mode: "sender"
        };

        //if (clientId) 
            //peerInfo["id"] = clientId;

        webrtc.connection.emit('setinfo', peerInfo);

        webrtc.on('readyToCall', function () {
            if (room) webrtc.appointRoom(room);
            $('#accesslink').val(signalingServer + '/' + room + '/' + localStorage.getItem("clientName"));
        });

        //código agregado para recibir mensajes - Inicio
        webrtc.on('channelMessage', function (peer, label, data) {
            if (data.type == 'custommessage') {
                $('#received').append(data.payload + '\n');
                $('#received').scrollTop($('#received')[0].scrollHeight);
            }
        });
        //código agregado para recibir mensajes - Inicio
        //código agregado para enviar mensajes - Inicio
        $('#message').keypress(function (e) {
            if ((e.which || e.keyCode) === 13 && $('#message').val())
                webrtc.sendDataChannelMessageToAll($('#message').val());
        });
    
        $('#sendmessage').click(function () {
            if ($('#message').val()) {
                webrtc.sendDataChannelMessageToAll($('#message').val());
                // console.log($('#message').val());
            }
        });
        //código agregado para enviar mensajes - final

        
        $('#ConnectStatus').attr('data-state', 'enabled');
        $('#mainButton').attr("data-state", "started");
        $('#mainButton').text("Stop");
        enableForm(false);
    } else {
        alert("Fill missing data");
    }
}

function stop() {
    webrtc.leaveRoom();
    webrtc.disconnect();
    webrtc.webrtc.localStreams.forEach(
        (stream) => {
            stream.getTracks().forEach(
                track => track.stop()
            );
        }
    );

    $('#ConnectStatus').attr('data-state', 'disabled');
    $('#mainButton').attr("data-state", "stopped");
    $('#mainButton').text("Start");
    
    enableForm(true);
    initCamera();
}

const init = async () => {
    await initCameraSelection();
    parseUrl();
    reStoreData(reStoreDataCustom);
    enableForm(true);
    initCamera();

    $('#mainButton').click(function () {
        if ($('#mainButton').attr("data-state") == "stopped") start();
        else stop();
    });

    $('#mute').click(function () {
        if ($('#mute').attr('data-state') == 'mute') {
            $('#mute').attr('data-state', 'unmute');
            var lvid = document.getElementById('localvid');
            if (lvid) lvid.muted = true;
        }
        else {
            $('#mute').attr('data-state', 'mute')
            if (videoEl) videoEl.muted = false;
        }
    });

    $('#fs').click(function () {
        var videoEl = document.getElementById('localvid');
        var rfs = videoEl.requestFullscreen
            || videoEl.webkitRequestFullScreen
            || videoEl.mozRequestFullScreen
            || videoEl.msRequestFullscreen;

        rfs.call(videoEl);
    });
}

const getDevices = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'videoinput');
};

const initCameraSelection = async () => {
    const videoDevices = await getDevices();
    const options = videoDevices.map((videoDevice, i) => {
        cameras[i] = videoDevice.deviceId;
        return `<option value="${i}">${videoDevice.label}</option>`;
    });
    inputOptions.innerHTML = options.join('');
};

const inputOptions = document.querySelector('select#input-options');
const mirrorOptions = document.querySelector('select#mirror-options');
const resolutionOptions = document.querySelector('select#resolution-options');
const videoCodecOptions = document.querySelector('select#vidEncoder');

const resolutions = {
    "default": [320, 240],
    "320240":  [320, 240],
    "640360":  [640, 360],
    "640480":  [640, 480],
    "1280720": [1280, 720],
    "19201080":[1920, 1080],
};

var clientId = "";
var cameras = [];
var webrtc = {};
var currentLocation = window.location;
// var signalingServer = currentLocation.protocol + "//" + currentLocation.host;
var signalingServer = 'https://153.92.210.19:8889';

inputOptions.onchange = () => { reinit(); };
mirrorOptions.onchange = () => { reinit(); };
resolutionOptions.onchange = () => { reinit(); };
videoCodecOptions.onchange = () => { reinit(); };
$(document).ready(() => { init(); });