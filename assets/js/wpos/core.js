/**
 * core.js is part of Wallace Point of Sale system (WPOS)
 *
 * core.js is the main object that provides base functionality to the WallacePOS terminal.
 * It loads other needed modules and provides authentication, storage and data functions.
 *
 * WallacePOS is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3.0 of the License, or (at your option) any later version.
 *
 * WallacePOS is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details:
 * <https://www.gnu.org/licenses/lgpl.html>
 *
 * @package    wpos
 * @copyright  Copyright (c) 2014 WallaceIT. (https://wallaceit.com.au)
 * @author     Michael B Wallace <micwallace@gmx.com>
 * @since      Class created 15/1/14 12:01 PM
 */

function WPOS() {

    var initialsetup = false;
    this.initApp = function () {
        // set cache default to true
        $.ajaxSetup({
            cache: true
        });
        // check online status to determine start & load procedure.
        if (checkOnlineStatus()) {
            WPOS.checkCacheUpdate(); // check if application cache is updating or already updated
        } else {
            // check approppriate offline records exist
            if (switchToOffline()) {
                WPOS.initLogin();
            }
        }
    };
    var cacheloaded = 1;
    this.checkCacheUpdate = function(){
            // check if cache exists, if the app is loaded for the first time, we don't need to wait for an update
            if (window.applicationCache.status == window.applicationCache.UNCACHED){
                console.log("Application cache not yet loaded.");
                WPOS.initLogin();
                return;
            }
            // For chrome, the UNCACHED status is never seen, instead listen for the cached event, cache has finished loading the first time
            window.applicationCache.addEventListener('cached', function(e) {
                console.log("Cache loaded for the first time, no need for reload.");
                WPOS.initLogin();
            });
            // wait for update to finish: check after applying event listener aswell, we may have missed the event.
            window.applicationCache.addEventListener('updateready', function(e) {
                console.log("Appcache update finished, reloading...");
                setLoadingBar(100, "Loading...");
                location.reload();
            });
            window.applicationCache.addEventListener('noupdate', function(e) {
                console.log("No appcache update found");
                WPOS.initLogin();
            });
            window.applicationCache.addEventListener('progress', function(e) {
                var loaded = parseInt((100/ e.total)*e.loaded);
                cacheloaded = isNaN(loaded)?(cacheloaded+1):loaded;
                //console.log(cacheloaded);
                setLoadingBar(cacheloaded, "Updating application...");
            });
            window.applicationCache.addEventListener('downloading', function(e) {
                console.log("Updating appcache");
                setLoadingBar(1, "Updating application...");
            });
            if (window.applicationCache.status == window.applicationCache.UPDATEREADY){
                console.log("Appcache update finished, reloading...");
                setLoadingBar(100, "Loading...");
                location.reload();
            }
    };
    // Check for device UUID & present Login, initial setup is triggered if the device UUID is not present
    this.initLogin = function(){
        showLogin();
        if (getDeviceUUID() == null) {
            // The device has not been setup yet; User will have to login as an admin to setup the device.
            alert("The device has not been setup yet, please login as an administrator to setup the device.");
            initialsetup = true;
            online = true;
            return false;
        }
        return true;
    };
    // Plugin initiation functions
    this.initPlugins = function(){
        // load keypad if set
        setKeypad(true);
        // load printer plugin
        WPOS.print.loadPrintSettings();
        // deploy scan apps
        deployDefaultScanApp();
    };
    this.initKeypad = function(){
        setKeypad(false);
    };
    function setKeypad(setcheckbox){
        if (getLocalConfig().keypad == true ){
            WPOS.util.initKeypad();

            if (setcheckbox)
            $("#keypadset").prop("checked", true);
        } else {
            if (setcheckbox)
            $("#keypadset").prop("checked", false);
        }
        // set keypad focus on click
        $(".numpad").on("click", function () {
            $(this).focus().select();
        });
    }
    function deployDefaultScanApp(){
        $.getScript('/assets/js/jquery.scannerdetection.js').done(function(){
            // Init plugin
            $(window).scannerDetection({
                onComplete: function(barcode){
                    // switch to sales tab
                    $("#wrapper").tabs( "option", "active", 0 );
                    WPOS.items.addItemFromStockCode(barcode);
                }
            });
        }).error(function(){
            alert("Failed to load the scanning plugin.");
        });
    }

    // AUTH
    function showLogin() {
        $("#modaldiv").show();
        $("#logindiv").show();
        $("#loadingdiv").hide();
        $('#loginbutton').removeAttr('disabled', 'disabled');
        setLoadingBar(0, "");
        $('body').css('overflow', 'auto');
    }

    this.userLogin = function () {
        WPOS.util.showLoader();
        var loginbtn = $('#loginbutton');
        // disable login button
        $(loginbtn).prop('disabled', true);
        $(loginbtn).val('Proccessing');
        // auth is currently disabled on the php side for ease of testing. This function, however will still run and is currently used to test session handling.
        // get form values
        var userfield = $("#username");
        var passfield = $("#password");
        var username = userfield.val();
        var password = passfield.val();
        // hash password
        password = WPOS.util.md5(password);
        // authenticate
        if (authenticate(username, password) === true) {
            userfield.val('');
            passfield.val('');
            $("#logindiv").hide();
            $("#loadingdiv").show();
            // initiate data download/check
            if (initialsetup) {
                if (isUserAdmin()) {
                    initSetup();
                } else {
                    alert("You must login as an administrator for first time setup");
                    showLogin();
                }
            } else {
                initData(true);
            }
        }
        passfield.val('');
        $(loginbtn).val('Login');
        $(loginbtn).prop('disabled', false);
        WPOS.util.hideLoader();
    };

    this.logout = function () {
        var answer = confirm("Are you sure you want to logout?");
        if (answer) {
            WPOS.util.showLoader();
            stopSocket();
            WPOS.getJsonData("logout");
            showLogin();
            WPOS.util.hideLoader();
        }
    };

    function authenticate(user, hashpass) {
        // auth against server if online, offline table if not.
        if (online == true) {
            // send request to server
            var response = WPOS.sendJsonData("auth", JSON.stringify({username: user, password: hashpass, getsessiontokens:true}));
            if (response !== false) {
                // set current user will possibly get passed additional data from server in the future but for now just username and pass is enough
                setCurrentUser(response);
                updateAuthTable(response);
                return true;
            } else {
                return false;
            }
        } else {
            return offlineAuth(user, hashpass);
        }
    }

    function sessionRenew(){
        // send request to server
        var response = WPOS.sendJsonData("authrenew", JSON.stringify({username:currentuser.username, auth_hash:currentuser.auth_hash}));
        if (response !== false) {
            // set current user will possibly get passed additional data from server in the future but for now just username and pass is enough
            setCurrentUser(response);
            updateAuthTable(response);
            return true;
        } else {
            return false;
        }
    }

    function offlineAuth(username, hashpass) {
        if (localStorage.getItem("wpos_auth") !== null) {
            var jsonauth = $.parseJSON(localStorage.getItem("wpos_auth"));
            if (jsonauth[username] === null || jsonauth[username] === undefined) {
                alert("Sorry, your credentials are currently not available offline.");
                return false;
            } else {
                var authentry = jsonauth[username];
                if (authentry.auth_hash == WPOS.util.SHA256(hashpass+authentry.token)) {
                    setCurrentUser(authentry);
                    return true;
                } else {
                    alert("Access denied!");
                    return false;
                }
            }
        } else {
            alert("We tried to authenticate you without an internet connection but there are currently no local credentials stored.");
            return false;
        }
    }

    this.getCurrentUserId = function () {
        return currentuser.id
    };

    var currentuser;
    // set current user details
    function setCurrentUser(user) {
        currentuser = user;
    }

    function isUserAdmin() {
        return currentuser.isadmin == 1;
    }

    // initiate the setup process
    this.deviceSetup = function () {
        WPOS.util.showLoader();
        var devid = $("#posdevices option:selected").val();
        var devname = $("#newposdevice").val();
        var locid = $("#poslocations option:selected").val();
        var locname = $("#newposlocation").val();
        // check input
        if ((devid == null && devname == null) || (locid == null && locname == null)) {
            alert("Please select a item from the dropdowns or specify a new name.");
        } else {
            // call the setup function
            if (deviceSetup(devid, devname, locid, locname)) {
                currentuser = null;
                initialsetup = false;
                $("#setupdiv").dialog("close");
                showLogin();
                WPOS.initPlugins();
            } else {
                alert("There was a problem setting up the device, please try again.");
            }
        }
        WPOS.util.hideLoader();
    };

    function initSetup() {
        WPOS.util.showLoader();
        // get pos locations and devices and populate select lists
        var devices = WPOS.getJsonData("devices/get");
        var locations = WPOS.getJsonData("locations/get");

        for (var i in devices) {
            if (devices[i].disabled == 0){ // do not add disabled devs
                $("#posdevices").append('<option value="' + devices[i].id + '">' + devices[i].name + ' (' + devices[i].locationname + ')</option>');
            }
        }
        for (i in locations) {
            if (locations[i].disabled == 0){
                $("#poslocations").append('<option value="' + locations[i].id + '">' + locations[i].name + '</option>');
            }
        }
        WPOS.util.hideLoader();
        // show the setup dialog
        $("#setupdiv").dialog("open");
    }

    // get initial data for pos startup.
    function initData(loginloader) {
        if (loginloader){
            $("#loadingprogdiv").show();
            $("#loadingdiv").show();
        }
        if (online) {
            $("#loadingbartxt").text("Loading online resources");
            // get device info and settings
            setLoadingBar(10, "Getting device settings...");
            setStatusBar(4, "Updating device settings...");
            if (!fetchConfigTable()){
                showLogin();
                return;
            }
            // get stored items
            setLoadingBar(30, "Getting stored items...");
            setStatusBar(4, "Updating stored items...");
            if (!fetchItemsTable()){
                showLogin();
                return;
            }
            // get customers
            setLoadingBar(60, "Getting customer accounts...");
            setStatusBar(4, "Updating customers...");
            if (!fetchCustTable()){
                showLogin();
                return;
            }
            // get all sales (Will limit to the weeks sales in future)
            setLoadingBar(80, "Getting recent sales...");
            setStatusBar(4, "Updating sales...");
            if (!fetchSalesTable()){
                showLogin();
                return;
            }
            // start websocket connection
            startSocket();
            setStatusBar(1, "WPOS is Online");
            // check for offline sales on login
            setTimeout('if (WPOS.sales.getOfflineSalesNum()){ if (WPOS.sales.uploadOfflineRecords()){ WPOS.setStatusBar(1, "WPOS is online"); } }', 2000);
        } else {
            // check records and initiate java objects
            $("#loadingbartxt").text("Loading online resources");
            setLoadingBar(50, "Loading offline data...");
            loadConfigTable();
            loadItemsTable();
            loadCustTable();
            loadSalesTable();
            alert("Your internet connection is not active and WPOS has started in offline mode.\nSome features are not available in offline mode but you can always make sales and alter transactions that are locally available. \nWhen a connection becomes available WPOS will process your transactions on the server.");
        }
        if (loginloader){
            setLoadingBar(100, "Initializing the awesome...");
            $("title").text("WallacePOS - Your POS in the cloud");
            WPOS.initPlugins();
            setTimeout('$("#modaldiv").hide();', 500);
        }
    }

    function setLoadingBar(progress, status) {
        var loadingprog = $("#loadingprog");
        var loadingstat = $("#loadingstat");
        $(loadingstat).text(status);
        $(loadingprog).css("width", progress + "%");
    }

    /**
     * Update the pos status text and icon
     * @param statusType (1=Online, 2=Uploading, 3=Offline, 4=Downloading)
     * @param text
     */
    this.setStatusBar = function(statusType, text){
        setStatusBar(statusType, text);
    };

    function setStatusBar(statusType, text){
        var staticon = $("#wposstaticon");
        var statimg = $("#wposstaticon i");
        switch (statusType){
            // Online icon
            case 1: $(staticon).attr("class", "badge badge-success");
                $(statimg).attr("class", "icon-ok");
                break;
            // Upload icon
            case 2: $(staticon).attr("class", "badge badge-info");
                $(statimg).attr("class", "icon-cloud-upload");
                break;
            // Offline icon
            case 3: $(staticon).attr("class", "badge badge-warning");
                $(statimg).attr("class", "icon-exclamation");
                break;
            // Download icon
            case 4: $(staticon).attr("class", "badge badge-info");
                $(statimg).attr("class", "icon-cloud-download");
                break;
        }
        $("#wposstattxt").text(text);
    }

    var online = false;

    this.isOnline = function () {
        return online;
    };

    function checkOnlineStatus() {
        try {
            var res = $.ajax({
            timeout : 3000,
            url     : "/api/hello",
            type    : "GET",
            cache   : false,
            dataType: "text",
            async   : false
            }).status;
            online = res == "200";
        } catch (ex){
            online = false;
        }
        return online;
    }

    // OFFLINE MODE FUNCTIONS
    function canDoOffline() {
        if (getDeviceUUID()!==null) { // can't go offline if device hasn't been setup
            // check for auth table
            if (localStorage.getItem("wpos_auth") == null) {
                return false;
            }
            // check for machine settings etc.
            if (localStorage.getItem("wpos_config") == null) {
                return false;
            }
            return localStorage.getItem("wpos_items") != null;
        }
        return false;
    }

    var checktimer;

    this.switchToOffline = function(){
        return switchToOffline();
    };

    function switchToOffline() {
        if (canDoOffline()==true) {
            // set js indicator: important
            online = false;
            setStatusBar(3, "WPOS is Offline");
            // start online check routine
            checktimer = setInterval(doOnlineCheck, 60000);
            return true;
        } else {
            // display error notice
            alert("There was an error connecting to the webserver & files needed to run offline are not present :( \nPlease check your connection and try again.");
            $("#modaldiv").show();
            ('#loginbutton').prop('disabled', true);
            setLoadingBar(100, "Error switching to offine mode");
            return false;
        }
    }

    function doOnlineCheck() {
        if (checkOnlineStatus()==true) {
            clearInterval(checktimer);
            switchToOnline();
        }
    }

    function switchToOnline() {
        // upload offline sales
        if (WPOS.sales.uploadOfflineRecords()){
            // set js and ui indicators
            online = true;
            // load fresh data
            initData(false);
            // initData();
            setStatusBar(1, "WPOS is Online");
        }
    }

    // GLOBAL COM FUNCTIONS
    this.sendJsonData = function (action, data) {
        // send request to server
        try {
        var response = $.ajax({
            url     : "/api/"+action,
            type    : "POST",
            data    : {data: data},
            dataType: "text",
            timeout : 10000,
            cache   : false,
            async   : false
        });
        if (response.status == "200") {
            var json = $.parseJSON(response.responseText);
            if (json == null) {
                alert("Error: The response that was returned from the server could not be parsed!");
                return false;
            }
            var errCode = json.errorCode;
            var err = json.error;
            if (err == "OK") {
                // echo warning if set
                if (json.hasOwnProperty('warning')){
                    alert(json.warning);
                }
                return json.data;
            } else {
                if (errCode == "auth") {
                    if (sessionRenew()) {
                        // try again after authenticating
                        return WPOS.sendJsonData(action, data);
                    } else {
                        //alert(err);
                        return false;
                    }
                } else {
                    alert(err);
                    return false;
                }
            }
        } else {
            switchToOffline();
            alert("There was an error connecting to the server: \n"+response.statusText+", \n switching to offline mode");
            return false;
        }
        } catch (ex) {
            switchToOffline();
            alert("There was an error sending data, switching to offline mode");
            return false;
        }
    };

    this.sendJsonDataAsync = function (action, data, callback, callbackref) {
        // send request to server
        try {
            var response = $.ajax({
                url     : "/api/"+action,
                type    : "POST",
                data    : {data: data},
                dataType: "json",
                timeout : 10000,
                cache   : false,
                success : function(json){
                    var errCode = json.errorCode;
                    var err = json.error;
                    if (err == "OK") {
                        // echo warning if set
                        if (json.hasOwnProperty('warning')){
                            alert(json.warning);
                        }
                        callback(json.data, callbackref);
                    } else {
                        if (errCode == "auth") {
                            if (sessionRenew()) {
                                // try again after authenticating
                                callback(WPOS.sendJsonData(action, data), callbackref);
                            } else {
                                //alert(err);
                                callback(false, callbackref);
                            }
                        } else {
                            alert(err);
                            callback(false, callbackref);
                        }
                    }
                },
                error   : function(jqXHR, status, error){
                    alert(error);
                    callback(false, callbackref);
                }
            });
            return true;
        } catch (ex) {
            return false;
        }
    };

    this.getJsonData = function (action) {
        // send request to server
        try {
        var response = $.ajax({
            url     : "/api/"+action,
            type    : "GET",
            dataType: "text",
            timeout : 10000,
            cache   : false,
            async   : false
        });
        if (response.status == "200") {
            var json = $.parseJSON(response.responseText);
            var errCode = json.errorCode;
            var err = json.error;
            if (err == "OK") {
                // echo warning if set
                if (json.hasOwnProperty('warning')){
                    alert(json.warning);
                }
                return json.data;
            } else {
                if (errCode == "auth") {
                    if (sessionRenew()) {
                        // try again after authenticating
                        return WPOS.getJsonData(action);
                    } else {
                        //alert(err);
                        return false;
                    }
                } else {
                    alert(err);
                    return false;
                }
            }
        } else {
            alert("There was an error connecting to the server: \n"+response.statusText);
            return false;
        }
        } catch (ex){
            return false;
        }
    };

    // AUTHENTICATION & USER SETTINGS
    /**
     * Update the offline authentication table using the json object provided. This it returned on successful login.
     * @param {object} jsonobj ; user record returned by authentication
     */
    function updateAuthTable(jsonobj) {
        var jsonauth;
        if (localStorage.getItem("wpos_auth") !== null) {
            jsonauth = $.parseJSON(localStorage.getItem("wpos_auth"));
            jsonauth[jsonobj.username.toString()] = jsonobj;
        } else {
            jsonauth = { };
            jsonauth[jsonobj.username.toString()] = jsonobj;
        }
        localStorage.setItem("wpos_auth", JSON.stringify(jsonauth));
    }

    // DEVICE SETTINGS AND INFO
    var configtable;

    this.getConfigTable = function () {
        if (configtable == null) {
            loadConfigTable();
        }
        return configtable;
    };
    this.currency = function(){
        if (configtable == null) {
            loadConfigTable();
        }
        return configtable.general.curformat;
    };
    /**
     * Fetch device settings from the server using UUID
     * @return null
     */
    function fetchConfigTable() {
        var data = {};
        data.uuid = getDeviceUUID();
        configtable = WPOS.sendJsonData("config/get", JSON.stringify(data));
        if (configtable) {
            if (configtable.hasOwnProperty("remdev")){ // return false if dev is disabled
                initialsetup = true;
                return false;
            } else {
                localStorage.setItem("wpos_config", JSON.stringify(configtable));
                initTaxFunc();
                setAppCustomization();
                return true;
            }
        }
        return false;
    }

    function loadConfigTable() {
        var data = localStorage.getItem("wpos_config");
        if (data != null) {
            configtable = JSON.parse(data);
            initTaxFunc();
            return true;
        }
        return false;
    }

    function updateConfig(key, value){
        configtable[key] = value; // write to current data
        localStorage.setItem("wpos_config", JSON.stringify(configtable));
        setAppCustomization();
    }

    function setAppCustomization(){
        var url = WPOS.getConfigTable().general.bizlogo;
        console.log(url);
        $("#watermark").css("background-image", "url('"+url+"')");
    }

    this.getTaxTable = function () {
        if (configtable == null) {
            loadConfigTable();
        }
        return configtable.tax;
    };
    // Tax Rate config
    function initTaxFunc(){
        // evaluate function string into a function
        var tempfunc;
        for (var i in configtable.tax){
            tempfunc = configtable.tax[i].calcfunc;
            eval("tempfunc = "+tempfunc);
            configtable.tax[i].calcfunc = tempfunc;
        }
    }
    // Local Config
    this.setLocalConfigValue = function(key, value){
        setLocalConfigValue(key, value);
    };

    this.getLocalConfig = function(){
        return getLocalConfig();
    };

    function getLocalConfig(){
        var lconfig = localStorage.getItem("wpos_lconfig");
        if (lconfig==null || lconfig==undefined){
            // put default config here.
            var defcon = {printmethod: "br", docmethod: "br", rectype: "raw", recbaud: "9600", recdatabits: "8", recstopbits: "1", recparity: "even", recflow: "none", recip: "127.0.0.1", rectcpport: 8080, cashdraw: false, keypad: true, recask:"email", eftpos:{enabled: false, receipts:true, provider: 'tyro', merchrec:'ask', custrec:'ask'}};
            updateLocalConfig(defcon);
            return defcon;
        }
        return JSON.parse(lconfig);
    }

    function setLocalConfigValue(key, value){
        var data = localStorage.getItem("wpos_lconfig");
        if (data==null){
            data = {};
        } else {
            data = JSON.parse(data);
        }
        data[key] = value;
        updateLocalConfig(data);
        if (key == "keypad"){
            setKeypad(false);
        }
    }

    function updateLocalConfig(configobj){
        localStorage.setItem("wpos_lconfig", JSON.stringify(configobj));
    }

    /**
     * This function sets up the
     * @param {int} devid ; if not null, the newname var is ignored and the new uuid is merged with the device specified by devid.
     * @param {int} newdevname ; A new device name, if specified the
     * @param {int} locid ; if not null, the newlocname field is ignored and blah blah blah....
     * @param {int} newlocname ; if not null, the newlocname field is ignored and blah blah blah....
     * @returns {boolean}
     */
    function deviceSetup(devid, newdevname, locid, newlocname) {
        var data = {};
        data.uuid = setDeviceUUID(false);
        if (devid === "") {
            data.devname = newdevname;
        } else {
            data.devid = devid;
        }
        if (locid === "") {
            data.locname = newlocname;
        } else {
            data.locid = locid;
        }
        var configobj = WPOS.sendJsonData("devices/setup", JSON.stringify(data));
        if (configobj) {
            localStorage.setItem("wpos_config", JSON.stringify(configobj));
            configtable = configobj;
            return true;
        } else {
            setDeviceUUID(true);
            return false;
        }
    }

    /**
     * Returns the current devices UUID
     * @returns {String, Null} String if set, null if not
     */
    function getDeviceUUID() {
        // return the devices uuid; if null, the device has not been setup or local storage was cleared
        return localStorage.getItem("wpos_devuuid");
    }

    /**
     * Creates or clears device UUID and updates in local storage
     * @param clear If true, the current UUID is detroyed
     * @returns {String, Null} String uuid if set, null if cleared
     */
    function setDeviceUUID(clear) {
        var uuid = null;
        if (clear) {
            localStorage.removeItem("wpos_devuuid");
        } else {
            // generate a md5 UUID using datestamp and rand for entropy and return the result
            var date = new Date().getTime();
            uuid = WPOS.util.md5((date * Math.random()).toString());
            localStorage.setItem("wpos_devuuid", uuid);
        }
        return uuid;
    }

    // RECENT SALES
    var salestable;

    this.getSalesTable = function () {
        if (salestable == null) {
            loadSalesTable();
        }
        return salestable;
    };

    this.updateSalesTable = function (ref, saleobj) {
        salestable[ref] = saleobj;
    };

    this.removeFromSalesTable = function (ref){
        delete salestable[ref];
    };

    function fetchSalesTable() {
        salestable = WPOS.sendJsonData("sales/get", JSON.stringify({deviceid: configtable.deviceid}));
        if (salestable) {
            localStorage.setItem("wpos_csales", JSON.stringify(salestable));
            return true;
        }
        return false;
    }

    // loads from local storage
    function loadSalesTable() {
        var data = localStorage.getItem("wpos_csales");
        if (data !== null) {
            salestable = JSON.parse(data);
            return true;
        }
        return false;
    }

    // adds/updates a record in the current table
    function updateSalesTable(saleobject) {
        // delete the sale if ref supplied
        if (typeof saleobject === 'object'){
            salestable[saleobject.ref] = saleobject;
        } else {
            delete salestable[saleobject];
        }
        localStorage.setItem("wpos_csales", JSON.stringify(salestable));
    }

    // STORED ITEMS
    var itemtable;
    var stockindex;

    this.getItemsTable = function () {
        if (itemtable == null) {
            loadItemsTable();
        }
        return itemtable;
    };

    this.getStockIndex = function () {
        if (stockindex === undefined || stockindex === null) {
            if (custtable == null) {
                loadItemsTable(); // also generate stock index
            } else {
                generateStockIndex();
            }
        }
        return stockindex;
    };
    // fetches from server
    function fetchItemsTable() {
        itemtable = WPOS.getJsonData("items/get");
        if (itemtable) {
            localStorage.setItem("wpos_items", JSON.stringify(itemtable));
            generateStockIndex();
            WPOS.items.generateItemGrid();
            return true;
        }
        return false;
    }

    function generateStockIndex() {
        stockindex = {};
        for (var key in itemtable) {
            stockindex[itemtable[key].code] = key;
        }
    }

    // loads from local storage
    function loadItemsTable() {
        var data = localStorage.getItem("wpos_items");
        if (data != null) {
            itemtable = JSON.parse(data);
            // generate the stock index as well.
            generateStockIndex();
            WPOS.items.generateItemGrid();
            return true;
        }
        return false;
    }

    // adds/edits a record to the current table
    function updateItemsTable(itemobject) {
        // delete the sale if id/ref supplied
        if (typeof itemobject === 'object'){
            itemtable[itemobject.id] = itemobject;
        } else {
            delete itemtable[itemobject];
        }
        localStorage.setItem("wpos_items", JSON.stringify(itemtable));
        generateStockIndex();
        WPOS.items.generateItemGrid();
    }

    // CUSTOMERS
    var custtable;
    var custindex = [];
    this.getCustTable = function () {
        if (custtable == null) {
            loadCustTable();
        }
        return custtable;
    };
    this.getCustId = function(email){
        if (custindex.hasOwnProperty(email)){
            return custindex[email];
        }
        return false;
    };
    // fetches from server
    function fetchCustTable() {
        custtable = WPOS.getJsonData("customers/get");
        if (custtable) {
            localStorage.setItem("wpos_customers", JSON.stringify(custtable));
            generateCustomerIndex();
            return true;
        }
        return false;
    }

    // loads from local storage
    function loadCustTable() {
        var data = localStorage.getItem("wpos_customers");
        if (data != null) {
            custtable = JSON.parse(data);
            generateCustomerIndex();
            return true;
        }
        return false;
    }

    function generateCustomerIndex(){
        custindex = [];
        for (var i in custtable){
            custindex[custtable[i].email] = custtable[i].id;
        }
    }

    this.updateCustTable = function(id, data){
        updateCustTable(id, data);
    };

    // adds a record to the current table
    function updateCustTable(id, data) {
        custtable[id] = data;
        // save to local store
        localStorage.setItem("wpos_customers", JSON.stringify(custtable));
        // add/update index
        custindex[data.email] = id;
    }
    // Websocket updates & commands
    var socket = null;
    var socketon = false;
    function startSocket(){
        if (socket==null){
            socket = io.connect('https://'+window.location.hostname+'/');
            socketon = true;
            socket.on('updates', function (data) {
            switch (data.a){
                case "item":
                    updateItemsTable(data.data);
                    break;

                case "sale":
                    updateSalesTable(data.data);
                    break;

                case "config":
                    updateConfig(data.type, data.data);
                    break;

                case "regreq":

                    socket.emit('reg', {deviceid: configtable.deviceid, username: currentuser.username});
                    break;

                case "msg":
                    alert(data.data);
                    break;

                case "reset":
                    resetTerminalRequest();
                    break;

                case "error":
                    alert(data.data);
                    break;
                }
                //alert(data.a);
            });
            socket.on('error', function(){
                if (socketon) // A fix for mod_proxy_wstunnel causing error on disconnect
                alert("Update feed could not be connected, \nyou will not receive realtime updates!");
            });
        } else {
            socket.socket.reconnect();
        }
    }

    function stopSocket(){
        if (socket!=null){
            socketon = false;
            socket.disconnect();
        }
    }

    window.onbeforeunload = function(){
        socketon = false;
    };

    // Reset terminal
    var reset_timer;
    var reset_interval;
    function resetTerminalRequest(){
        // Set timer
        var reset_timer = setTimeout("window.location.reload(true);", 10000);
        var reset_interval = setInterval('var r=$("#resettimeval"); r.text(r.text()-1);', 1000);
        $("#resetdialog").removeClass('hide').dialog({
            width : 'auto',
            maxWidth        : 370,
            modal        : true,
            closeOnEscape: false,
            autoOpen     : true,
            create: function( event, ui ) {
                // Set maxWidth
                $(this).css("maxWidth", "370px");
            },
            buttons: [
                {
                    html: "<i class='icon-check bigger-110'></i>&nbsp; Ok",
                    "class": "btn btn-success btn-xs",
                    click: function () {
                        window.location.reload(true);
                    }
                },
                {
                    html: "<i class='icon-remove bigger-110'></i>&nbsp; Cancel",
                    "class": "btn btn-xs",
                    click: function () {
                        clearTimeout(reset_timer);
                        clearInterval(reset_interval);
                        $("#resetdialog").dialog('close');
                        $("#resettimeval").text(10);
                    }
                }
            ]
        });
    }

    // TODO: On socket error, start a timer to reconnect

    // Contructor code
    // load WPOS Objects
    this.items = new WPOSItems();
    this.sales = new WPOSSales();
    this.trans = new WPOSTransactions();
    this.reports = new WPOSReports();
    this.print = new WPOSPrint();
    this.util = new WPOSUtil();
}
// UI widget functions & initialization
var toggleItemBox;
$(function () {
    // initiate core object
    WPOS = new WPOS();
    // initiate startup routine
    WPOS.initApp();

    $("#wrapper").tabs();

    $("#paymentsdiv").dialog({
        maxWidth : 380,
        width : 'auto',
        modal   : true,
        autoOpen: false,
        open    : function (event, ui) {
        },
        close   : function (event, ui) {
        },
        create: function( event, ui ) {
            // Set maxWidth
            $(this).css("maxWidth", "370px");
            $(this).css("minWidth", "325px");
        }
    });

    $("#transactiondiv").dialog({
        width   : 'auto',
        maxWidth: 900,
        modal   : true,
        autoOpen: false,
        title_html: true,
        open    : function (event, ui) {
            var tdiv = $("#transdivcontain");
            tdiv.css("width", tdiv.width()+"px");
        },
        close   : function (event, ui) {
            $("#transdivcontain").css("width", "100%");
        },
        create: function( event, ui ) {
            // Set maxWidth
            $(this).css("maxWidth", "900px");
        }
    });

    $("#setupdiv").dialog({
        width : 'auto',
        maxWidth        : 370,
        modal        : true,
        closeOnEscape: false,
        autoOpen     : false,
        open         : function (event, ui) {
            $(".ui-dialog-titlebar-close").hide();
        },
        close        : function (event, ui) {
            $(".ui-dialog-titlebar-close").show();
        },
        create: function( event, ui ) {
            // Set maxWidth
            $(this).css("maxWidth", "370px");
        }
    });

    $("#formdiv").dialog({
        width : 'auto',
        maxWidth     : 370,
        stack        : true,
        modal        : true,
        closeOnEscape: false,
        autoOpen     : false,
        open         : function (event, ui) {
        },
        close        : function (event, ui) {
        },
        create: function( event, ui ) {
            // Set maxWidth
            $(this).css("maxWidth", "370px");
        }
    });

    $("#voiddiv").dialog({
        width : 'auto',
        maxWidth        : 370,
        appendTo     : "#transactiondiv",
        modal        : true,
        closeOnEscape: false,
        autoOpen     : false,
        open         : function (event, ui) {
        },
        close        : function (event, ui) {
        },
        create: function( event, ui ) {
            // Set maxWidth
            $(this).css("maxWidth", "370px");
        }
    });

    $("#custdiv").dialog({
        width : 'auto',
        maxWidth        : 370,
        modal        : true,
        closeOnEscape: false,
        autoOpen     : false,
        open         : function (event, ui) {
        },
        close        : function (event, ui) {
        },
        create: function( event, ui ) {
            // Set maxWidth
            $(this).css("maxWidth", "370px");
        }
    });
    // item box
    var ibox = $("#ibox");
    var iboxhandle = $("#iboxhandle");
    var iboxopen = false;
    toggleItemBox = function(show){
        if (show){
            iboxopen = true;
            ibox.animate({width:"100%"}, 500);
        } else {
            iboxopen = false;
            ibox.animate({width:"0"}, 500);
        }
    };
    var isDragging = false;
    iboxhandle.on('mousedown', function() {
            $(window).on('mousemove touchmove', function() {
                isDragging = true;
                $(window).unbind("mousemove touchmove");
                $(window).on('mousemove touchmove', function(e) {
                    // get position
                    var parent = $("#iboxhandle").parent().parent();
                    //alert(parent);
                    if (parent.offset()!=undefined){
                        var parentOffset = parent.offset().left + parent.width();
                        var thisOffset = e.pageX;
                        // get width from the right side of the div.
                        var relX = (parentOffset - thisOffset);
                        // work out optimal size
                        if (relX>((parent.width()/2)+2)){
                            ibox.css('width', ibox.css('max-width')); // set max size max size
                        } else {
                            ibox.css('width', relX+"px");
                        }
                        //console.log(parent.offset().left);
                        // set box open indicator
                        iboxopen = (relX>0);
                    } else {
                        ibox.css('width', "0px");//closing too fast hide.
                    }
                });

            });
            $(window).on('mouseup touchcancel', function(){
                stopDragging();
            })
    });
    function stopDragging(){
        var wasDragging = isDragging;
        isDragging = false;
        $(window).unbind("mousemove");
        $(window).unbind("mouseup");
        $(window).unbind("touchmove");
        $(window).unbind("touchcancel");
        if (!wasDragging) { //was clicking
            if (iboxopen){
                toggleItemBox(false);
            } else {
                toggleItemBox(true);
            }
        }
    }
    // close on click outside item box
    $('html').on("click", function() {
        if (iboxopen) toggleItemBox(false); // hide if currently visible
    });
    ibox.on("click", function(event){
        event.stopPropagation();
    });
    // select text of number fields on click
    $(".numpad").on("click", function () {
        $(this).focus().select();
    });
    // keyboard field navigation
    $(document.documentElement).keydown(function (event) {
        // handle cursor keys
        var e = jQuery.Event("keydown");
        var x;
        if (event.keyCode == 37) {
            $(".keypad-popup").hide();
            x = $('input:not(:disabled), textarea:not(:disabled)');
            x.eq(x.index(document.activeElement) - 1).focus().trigger('click');

        } else if (event.keyCode == 39) {
            $(".keypad-popup").hide();
            x = $('input:not(:disabled), textarea:not(:disabled)');
            x.eq(x.index(document.activeElement) + 1).focus().trigger('click');
        }
    });
});
