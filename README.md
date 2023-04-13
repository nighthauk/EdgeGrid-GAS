# EdgeGrid Authentication for Google Apps Script

This library implements an Authentication handler library for the Akamai EdgeGrid Authentication scheme in Google Apps Script.

> **IMPORTANT:** At the moment, this is a skunkworks project and is neither supported nor officially maintained by Akamai. Currently the usage is only supported as a library include from within GAS console, but will be working to implement support for npm for import with Google clasp.

## Install

`Coming Soon`

## Example

### Credentials

Before you begin, you need to [Create authentication credentials](https://techdocs.akamai.com/developer/docs/set-up-authentication-credentials) in [Control Center](https://control.akamai.com).

### .edgerc authentication

Currently the primary method of using the library involves providing the filename to an `.edgerc` file. This file contains the authentication credentials used to sign your requests, and should live in the root of your Google Drive.

> **NOTE**: Google will request permission to access specific files and/or APIs to allow this to work. Be sure to select "Allow" should these permission requests appear. Once permissions have been accepted, requests to the API are signed with a timestamp and are executed immediately.

```javascript
let data = 'bodyData';

// Supply the path to your .edgerc file and name
// of the section with authorization to the client
// you are calling (default section is 'default')
let eggas = new EdgeGridGAS.init({
    file: '.edgerc',
    section: 'section-name',
});

eggas.auth({
    path: '/alerts/v2/alert-definitions',
    method: 'GET',
    headers: {
        Accept: 'application/json',
    },
    body: data,
});

let res = eggas.send();
let ui = SpreadsheetApp.getUi();
let result = ui.alert('Response', res, ui.ButtonSet.OK);
```

An `.edgerc` file contains sections for each of your API client credentials and is usually hosted in your home directory:

> **NOTE:** Currently this file should be a plain text file. Do not put this into a Google Doc. Changes are needed to accommodate both.

```plaintext
[default]
host = akaa-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.luna.akamaiapis.net
client_token = akab-XXXXXXXXXXXXXXXX-XXXXXXXXXXXXXXXX
client_secret = XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
access_token = akab-XXXXXXXXXXXXXXXX-XXXXXXXXXXXXXXXX
max-body = 131072

[section-name]
host = akaa-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.luna.akamaiapis.net
client_token = akab-XXXXXXXXXXXXXXXX-XXXXXXXXXXXXXXXX
client_secret = XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
access_token = akab-XXXXXXXXXXXXXXXX-XXXXXXXXXXXXXXXX
max-body = 131072
```

### Inline authentication

Inline authentication is here! This has been on the to-do list for a while, and finally got around to do it. This method of auth brings great capabilities not had before due to the way Google handles permissions. Basically, Google requires some type of user interaction with the UI to grant your appsscript code to control the UI itself, access other internal APIs, etc. For instance, when you authenticate via `.edgerc` file from your Google Drive folder, you must have some user action trigger that, like a context menu or sidebar. Where this gets tricky is, say I want a cell based function to run some API calls at some given cadence. It gets tricky without this method of inline authentication. This is now possible! One example use case is, say I'd like to check 500 hostnames to see if they've been onboarded into a property on Akamai. Now I can make a cell based function, do my inline auth and that cell formula itself can hold the code needed to call PAPI and look for this hostname. Even cooler, I can run that every minute if desired and always have those cells reflect accurate information without having to click a context menu or sidebar. Clear as mud?

```html
<!DOCTYPE html>
<html>

<head>
    <link rel="stylesheet" href="https://ssl.gstatic.com/docs/script/css/add-ons1.css">
    <base target="_top">
    <div class="sidebar branding-below">
        <div class="form-group">
            <p>
                <label for="client-secret">Client Secret</label>
                <input type="text" id="client-secret" style="width: 300px;">
            </p>
            <p>
                <label for="eg-host">Host</label>
                <input type="text" id="eg-host" style="width: 300px;">
            </p>
            <p>
                <label for="access-token">Access Token</label>
                <input type="text" id="access-token" style="width: 300px;">
            </p>
            <p>
                <label for="client-token">Client Token</label>
                <input type="text" id="client-token" style="width: 300px;">
            </p>
        </div>
        <div class="block">
            <input type="checkbox" id="strict-secure">
            <label for="strict-secure">Prefer ephemeral <i>(limiting, but most secure)</i></label>
        </div>

        <div class="block">
            <button class="blue" onclick="google.script.host.close();">Authenticate</button>
            <button onclick="google.script.host.close();">Cancel</button>
        </div>
    </div>

</html>
```

### Chaining

You can also chain calls, similar to using the node `akamai-edgegrid` library:

```javascript
let res = eggas
    .auth({
        path: '/alerts/v2/alert-definitions',
        method: 'GET',
        headers: {
            Accept: 'application/json',
        },
    })
    .send();
```

### Headers

Enter request headers as name-value pairs in an object. Below is an example of an API call to [List groups in your property](https://developer.akamai.com/api/core_features/property_manager/v1.html#getgroups). Change the `path` element to reference an endpoint in any of the [Akamai APIs](https://developer.akamai.com/api).

> **NOTE:** You don't need to include the `Content-Type` header. The authentication layer adds these values.

```javascript
eggas.auth({
    path: '/papi/v1/groups',
    method: 'GET',
    headers: {
        Accept: 'application/json',
    },
});
```

### Body data

You can provide the request `body` as either an object or as a POST data form string.

```javascript
// Object
eggas.auth({
    path: '/papi/v1/cpcodes?contractId=ctr_1234&groupId=grp_1234',
    method: 'POST',
    body: {
        cpcodeName: 'test-cpcode',
        productId: 'prd_Site_Accel',
    },
});
```

### Query string parameters

When entering query parameters use the `qs` property under the `auth` method. Set up the parameters as name-value pairs in a object.

> **NOTE**: accountSwitchKey is supported

```javascript

eggas.auth({
    path: '/papi/v1/cpcodes'
    , method: 'POST'
    , headers: {}
    , qs: {
        contractId: "ctr_1234"
        , groupId: "grp_1234"
    },
    , body: data
})

// Produces request URL similar to:
// https://akaa-baseurl-xxxxxxxxxxx-xxxxxxxxxxxxx.luna.akamaiapis.net/papi/v1/cpcodes?contractId=ctr_1234&groupId=grp_1234

```

## Reporting issues

To report a problem or make a suggestion, create a new [GitHub issue](https://github.com/nighthauk/EdgeGrid-GAS/issues).
