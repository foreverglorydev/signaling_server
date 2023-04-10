const resolutions = {
    "default": [0, 0], 
    "320240":  [320, 240],
    "640360":  [640, 360],
    "640480":  [640, 480],
    "1280720": [1280, 720],
    "19201080":[1920, 1080],
};

var cameras = [];
var currentLocation = window.location;
var signalingServer = currentLocation.protocol + "//" + currentLocation.host;

function validateData() {
    var items = getInputs();

    for (var i in items)
        if (!localStorage.getItem(items[i])) 
			return false;
    return true;
}

function storeData(customFn) {
    var items = getInputs();

    items.forEach((item) => {
        var data = $('#' + item).val();
        localStorage.setItem(item, data);
    });

    if (customFn)
        customFn();
}

function sleep_ex(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function reStoreData(customFn) {
    var items = getInputs();

    items.forEach((item) => {
        var data = localStorage.getItem(item);
        if (data) $('#' + item).val(data);
    });

    if (customFn)
        customFn();
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
    return options.join('');
};

function reinit() {
    storeData();
    window.location.reload(false);
};