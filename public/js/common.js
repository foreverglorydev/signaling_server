function validateData() {
    var items = getInputs();

    for (var i in items)
        if (!localStorage.getItem(items[i])) return false;
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

function reStoreData(customFn) {
    var items = getInputs();

    items.forEach((item) => {
        var data = localStorage.getItem(item);
        if (data) $('#' + item).val(data);
    });

    if (customFn)
        customFn();
}