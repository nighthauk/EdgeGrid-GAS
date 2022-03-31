eval(
    UrlFetchApp.fetch(
        'https://rawgit.com/medialize/URI.js/gh-pages/src/URI.js'
    ).getContentText()
);

/**
 * Class to create a new EdgeGrid auth token within GAS
 */
class EdgeGrid {
    /**
     * Class constructor
     * @param {object} obj  Init object which carries items needed to create and sign the auth token
     */
    constructor(obj) {
        this.obj = obj;
        this.edgerc();
    }

    /**
     * Called from constructor, builds the details needed for our token
     */
    edgerc() {
        let ui = SpreadsheetApp.getUi();

        // initialized with edgerc file from Google Drive
        if (this.obj.file) {
            const confSection = this.obj.section || 'default';
            const files = DriveApp.getFilesByName(this.obj.file);

            // get file contents, and specifically the section data
            while (files.hasNext()) {
                let edgerc = files.next();
                let raw = edgerc.getBlob().getDataAsString().split('\n');

                // get the edgerc section from raw file
                let confData = this.getSection(raw, confSection);

                if (!confData.length) {
                    throw new Error(
                        'An error occurred parsing the .edgerc file. You probably specified an invalid section name.'
                    );
                }

                // build the full config object
                this.config = this.buildObj(confData);
            }
        } else {
            ui.alert(JSON.stringify(this.obj));
        }
    }

    /**
     * Gets edgerc section details to create auth
     * @param {string} lines    The full edgerc contents
     * @param {string} sectionName  Which section to grab, default is default
     * @returns {array} - Built array of edgerc details
     */
    getSection(lines, sectionName) {
        const match = /^\s*\[(.*)]/;
        const section = [];

        // attempt to match the desired section
        lines.some((line, i) => {
            const lineMatch = line.match(match);
            const isMatch = lineMatch !== null && lineMatch[1] === sectionName;

            if (isMatch) {
                // go through section until we find a new one
                lines.slice(i + 1, lines.length).some((line) => {
                    const isMatch = line.match(match) !== null;
                    if (!isMatch) {
                        // push to section array
                        section.push(line);
                    }
                    return isMatch;
                });
            }
            return isMatch;
        });
        return section;
    }

    /**
     * Builds the full config object
     * @param {array} configs   The array of our edgerc details
     * @returns - Validated config object
     */
    buildObj(configs) {
        const result = {};
        let index, key, val, parsedValue, isComment;

        configs.forEach(function (config) {
            config = config.trim();
            isComment = config.indexOf(';') === 0;
            index = config.indexOf('=');

            if (index > -1 && !isComment) {
                key = config.substr(0, index);
                val = config.substring(index + 1);
                // remove inline comments
                parsedValue = val.replace(
                    /^\s*(['"])((?:\\\1|.)*?)\1\s*(?:;.*)?$/,
                    '$2'
                );

                if (parsedValue === val) {
                    // the value is not contained in matched quotation marks
                    parsedValue = val.replace(/\s*([^;]+)\s*;?.*$/, '$1');
                }
                // Remove trailing slash as if often found in the host property
                if (parsedValue.endsWith('/')) {
                    parsedValue = parsedValue.substr(0, parsedValue.length - 1);
                }

                result[key.trim()] = parsedValue;
            }
        });

        return this.validatedConfig(result);
    }

    /**
     * Handles validation of the config
     * @param {object} config   
     * @returns Validated config
     */
    validatedConfig(config) {
        if (
            !(
                config.host &&
                config.access_token &&
                config.client_secret &&
                config.client_token
            )
        ) {
            let errorMessage = '';
            const tokens = ['client_token', 'client_secret', 'access_token', 'host'];

            // check for any missing credentials and build error string
            tokens.forEach(function (token) {
                if (!config[token]) {
                    errorMessage += `Missing: ${token} `;
                }
            });

            throw new Error(`Invalid Configuration! ${errorMessage}`);
        }

        // ensure we have protocol
        if (config.host.indexOf('https://') > -1) {
            return config;
        }

        // add if not
        config.host = 'https://' + config.host;
        return config;
    }

    /**
     * Exposed auth method for signing the request
     * @param {object} req  
     * @returns - Full class object
     */
    auth(req) {
        // handle either a regular or deep merge of passed args and defaults
        let merge = (...args) => {
            // variables
            let target = {};

            // merge the source object with target object
            let merger = (obj) => {
                for (let prop in obj) {
                    if (obj.hasOwnProperty(prop)) {
                        if (
                            Object.prototype.toString.call(obj[prop]) === '[object Object]'
                        ) {
                            // if we're doing a deep merge and the property is an object
                            target[prop] = merge(target[prop], obj[prop]);
                        } else {
                            // otherwise, do a regular merge
                            target[prop] = obj[prop];
                        }
                    }
                }
            };

            //loop through each object and conduct a merge
            for (let i in args) {
                merger(args[i]);
            }

            return target;
        };

        // config defaults, merge should handle dupes
        // NOTE: GAS doesn't support overwriting User-Agent, so don't waste your time
        // GAS UA: Mozilla/5.0 (compatible; Google-Apps-Script; beanserver; +https://script.google.com; id: {id})
        let defaults = {
            baseURL: this.config.host,
            url: req.path,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            maxRedirects: 0,
        };

        let fullReq = merge(defaults, req);

        // convert body object to properly formatted string
        if (fullReq.body) {
            fullReq.body = typeof fullReq.body == 'object'
                ? JSON.stringify(fullReq.body)
                : fullReq.body;
        }

        // generate all auth items given req and assign to class obj
        this.request = this.generateAuth(
            fullReq,
            this.config.client_token,
            this.config.client_secret,
            this.config.access_token,
            this.config.host
        );

        return this;
    }

    /**
     * Generate the full auth header
     * @param {object} request  The full request object, unsigned
     * @param {string} clientToken  The edgerc client_token
     * @param {string} clientSecret The edgerc client_secret
     * @param {string} accessToken  The edgerc access_token
     * @param {string} host     The edgerc host
     * @param {string} maxBody The edgerc maxBody
     * @param {string} guid     Client UUID or create new
     * @param {string} timestamp    Timestamp of auth signing or create new
     * @returns - The request with generated url and generated auth header
     */
    generateAuth(
        request,
        clientToken,
        clientSecret,
        accessToken,
        host,
        maxBody,
        guid,
        timestamp
    ) {
        // set items that may not have been passed
        maxBody = maxBody || 131072;
        guid = guid || Utilities.getUuid();
        timestamp = timestamp || this.createTimestamp();

        // make the req url and auth header with passed params/defaults
        request.url = this.makeUrl(host, request.path, request.qs);
        request.headers.Authorization = this.makeAuthHeader(
            request,
            clientToken,
            accessToken,
            clientSecret,
            timestamp,
            guid,
            maxBody
        );

        return request;
    }

    /**
     * Utility function to pad start of a string, in this case to build our timestamp
     * @param {number} number   Number from Date object, NaN if obj is not valid date
     * @returns - Padded string
     */
    twoDigitNumberPad(number) {
        return String(number).padStart(2, '0');
    }

    /**
     * Creates the timestamp used in our edgegrid auth header
     * @returns - Edgegrid ready timestamp string
     */
    createTimestamp() {
        const date = new Date(Date.now());

        return (
            date.getUTCFullYear() +
            this.twoDigitNumberPad(date.getUTCMonth() + 1) +
            this.twoDigitNumberPad(date.getUTCDate()) +
            'T' +
            this.twoDigitNumberPad(date.getUTCHours()) +
            ':' +
            this.twoDigitNumberPad(date.getUTCMinutes()) +
            ':' +
            this.twoDigitNumberPad(date.getUTCSeconds()) +
            '+0000'
        );
    }

    /**
     * Build the full URL with qs's
     * @param {string} host  Host from request obj
     * @param {string} path  Path string from request obj 
     * @param {object} qsObj Query String object when creating auth
     * @returns - Built URI with query params
     */
    makeUrl(host, path, qsObj) {
        let queryString = '';

        if (qsObj) {
            // itterate over qs object and build into a string for use in URI
            queryString = Object.keys(qsObj)
                .map((key) => key + '=' + encodeURIComponent(qsObj[key]))
                .join('&');
        }

        // check to see if query string existed when initializing, if not make sure ? is included
        path = !path.includes('?') && qsObj
            ? `${path}?${queryString}`
            : path;

        const parsed = new URI(path, host);

        return parsed;
    }

    /**
     * Makes our full auth header for use in the actual API call
     * @param {object} request  Our full request object
     * @param {string} clientToken  Client token from creds
     * @param {string} accessToken  Access token from creds
     * @param {string} clientSecret  Client secret from creds
     * @param {string} timestamp    Our generated timestamp
     * @param {string} nonce   Client UUID 
     * @param {string} maxBody  Max body size from edgeer, if set
     * @returns - String of our signed auth header
     */
    makeAuthHeader(
        request,
        clientToken,
        accessToken,
        clientSecret,
        timestamp,
        nonce,
        maxBody
    ) {
        const keyValuePairs = {
            client_token: clientToken,
            access_token: accessToken,
            timestamp: timestamp,
            nonce: nonce,
        };

        let joinedPairs = '',
            authHeader,
            signedAuthHeader,
            key;

        // build string of our key value pairs
        for (key in keyValuePairs) {
            joinedPairs += key + '=' + keyValuePairs[key] + ';';
        }

        // preceed our joined pairs with HMAC SHA type
        authHeader = `EG1-HMAC-SHA256 ${joinedPairs}`;

        // sign our auth header
        signedAuthHeader =
            authHeader +
            'signature=' +
            this.signRequest(request, timestamp, clientSecret, authHeader, maxBody);

        return signedAuthHeader;
    }

    /**
     * Signs the full request 
     * @param {object} request  The full requrst object
     * @param {string} timestamp  Timestamp
     * @param {string} clientSecret  Client secred from creds
     * @param {string} authHeader Full Authorization header
     * @param {string} maxBody Max body for POST
     * @returns - Base 64 encoded hmac
     */
    signRequest(request, timestamp, clientSecret, authHeader, maxBody) {
        return this.base64HmacSha256(
            this.signData(request, authHeader, maxBody),
            this.signingKey(timestamp, clientSecret)
        );
    }

    /**
     * Sign the data
     * @param {object} request  Full request object
     * @param {string} authHeader  String of auth header
     * @param {string} maxBody  String of max body for POST
     * @returns - Full data for signature
     */
    signData(request, authHeader, maxBody) {
        const parsedUrl = new URI(request.url);
        const dataToSign = [
            request.method.toUpperCase(),
            parsedUrl.protocol(),
            parsedUrl.hostname(),
            parsedUrl.path() + '?' + parsedUrl.query(),
            this.canonicalizeHeaders(request.headersToSign),
            this.contentHash(request, maxBody),
            authHeader,
        ];

        // join data by tab and ensure it's a string
        const dataToSignStr = dataToSign.join('\t').toString();

        return dataToSignStr;
    }

    /**
     * Sign the key
     * @param {string} timestamp  Timestamp for signed req
     * @param {string} clientSecret  Client secret from creds
     * @returns - base64 hmac of key
     */
    signingKey(timestamp, clientSecret) {
        const key = this.base64HmacSha256(timestamp, clientSecret);
        return key;
    }

    /**
     * Canonicalize optional headersToSign property
     * @param {object} headers 
     * @returns - Formatted string of optional headersToSign property
     */
    canonicalizeHeaders(headers) {
        const formattedHeaders = [];

        // iterate over object and canonicalize split by space
        for (let key in headers) {
            formattedHeaders.push(
                key.toLowerCase() + ':' + headers[key].trim().replace(/\s+/g, ' ')
            );
        }

        return formattedHeaders.join('\t');
    }


    /**
     * Handle any POST data if present
     * @param {object} request 
     * @param {string} maxBody 
     * @returns 
     */
    contentHash(request, maxBody) {
        let contentHash = '',
            preparedBody = request.body || '';

        // handle body object
        if (typeof preparedBody === 'object') {
            Logger.log('Body content is type Object, transforming to POST data');

            let postDataNew = '';

            for (let key in preparedBody) {
                postDataNew += key + '=' + encodeURIComponent(JSON.stringify(preparedBody[key])) + '&';
            }

            // Strip trailing ampersand
            postDataNew = postDataNew.replace(/&+$/, '');

            preparedBody = postDataNew;
            request.body = preparedBody;
        }

        Logger.log(`Body is ${preparedBody} | Length is ${preparedBody.length}`);

        // handle post sizing
        if (request.method === 'POST' && preparedBody.length > 0) {
            Logger.log(`Signing content: ${preparedBody}`);

            // If body data is too large, cut down to max-body size
            if (preparedBody.length > maxBody) {
                Logger.log(`Data length (${preparedBody.length}) is larger than maximum ${maxBody}`);

                // trim body to maxBody
                preparedBody = preparedBody.substring(0, maxBody);
                Logger.log(`Body truncated. New value ${preparedBody}`);
            }


            contentHash = this.base64Sha256(preparedBody);
            Logger.log(`Body content hash is ${contentHash}`);
        }

        return contentHash;
    }

    /**
     * Create base64 hmac sha256 sig
     * @param {string} data  The data to sign
     * @param {string} key  The key to use
     * @returns - Base64 encoded signature
     */
    base64HmacSha256(data, key) {
        const encrypt = Utilities.computeHmacSignature(
            Utilities.MacAlgorithm.HMAC_SHA_256,
            data,
            key
        );

        return Utilities.base64Encode(encrypt);
    }

    /**
     * Create base64 digest with sha256 algorithm
     * @param {string} data  The data to digest
     * @returns - Base64 encoded digest
     */
    base64Sha256(data) {
        const shasum = Utilities.computeDigest(
            Utilities.DigestAlgorithm.SHA_256,
            data
        );
        return Utilities.base64Encode(shasum);
    }

    /**
     * Perform the API call with signed auth and payload
     * @returns - Response body
     */
    send() {
        Logger.log(`Request: ${JSON.stringify(this.request)}`);

        // Set UrlFetchApp specific options with our data
        let options = {
            headers: this.request.headers,
            contentType: 'application/json',
            method: this.request.method,
            payload: this.request.body,
            muteHttpExceptions: true,
        };

        try {
            // attempt to make the request
            let response = UrlFetchApp.fetch(this.request.url, options),
                json = response.getContentText(),
                data = JSON.parse(json);

            Logger.log(`Response: ${JSON.stringify(data)}`);
            return JSON.stringify(data);
        } catch (e) {
            Logger.log(`Error: ${e}`);
            return JSON.stringify(e);
        }
    }
}

/**
 * Create a new instance of our class
 * @param {object} obj  Our init object, edgerc file for now, soon to support creds via dialog
 * @returns 
 */
function init(obj) {
    // check to make sure an edgerc file was provided
    if (!obj.file) {
        throw new Error(
            'Neither a filename nor dialog type was specified. The file is typically .edgerc, and for purposes of GAS, it lives in your root Google Drive directory. If you would like to support auth via input dialog, please init with type: dialog.'
        );
    }

    return new EdgeGrid(obj);
}
