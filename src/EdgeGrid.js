eval(UrlFetchApp.fetch('https://rawgit.com/medialize/URI.js/gh-pages/src/URI.js').getContentText());

class EdgeGrid
{

    constructor(obj)
    {

        this.obj = obj;
        this.edgerc();

    }

    edgerc()
    {

        if (!this.obj.file)
        {
            throw new Error('A filename was not specified. This is typically .edgerc, and for purposes of GAS, it lives in your root Google Drive directory');            
        }
        else
        {

            const confSection = this.obj.section || 'default';
            const files = DriveApp.getFilesByName(this.obj.file);

            while (files.hasNext())
            {
                let edgerc = files.next();
                let raw = edgerc.getBlob().getDataAsString().split('\n');

                let confData = this.getSection(raw, confSection);

                if (!confData.length)
                {
                    throw new Error('An error occurred parsing the .edgerc file. You probably specified an invalid section name.');
                }

                this.config = this.buildObj(confData);
            }

        }
    
    }

    runsies(values)
    {
        Logger.log(values);
    }

    getSection(lines, sectionName)
    {

        const match = /^\s*\[(.*)]/
        const section = [];

        lines.some((line, i) => 
        {

            const lineMatch = line.match(match);
            const isMatch = lineMatch !== null && lineMatch[1] === sectionName;

            if (isMatch)
            {    
                // go through section until we find a new one
                lines.slice(i + 1, lines.length).some((line) => 
                {
                    const isMatch = line.match(match) !== null;
                    if (!isMatch) 
                    {
                        section.push(line);
                    }
                    return isMatch;
                }
                );
            }
            return isMatch;
        }
        );
        return section;

    }

    buildObj(configs)
    {

        const result = {};
        let index
            , key
            , val
            , parsedValue
            , isComment;

        configs.forEach(function (config)
        {
            config = config.trim();
            isComment = config.indexOf(';') === 0;
            index = config.indexOf('=');
            
            if (index > -1 && !isComment)
            {       
                key = config.substr(0, index);
                val = config.substring(index + 1);
                // remove inline comments
                parsedValue = val.replace(/^\s*(['"])((?:\\\1|.)*?)\1\s*(?:;.*)?$/, '$2');
                
                if (parsedValue === val)
                {
                    // the value is not contained in matched quotation marks
                    parsedValue = val.replace(/\s*([^;]+)\s*;?.*$/, '$1');
                }
                // Remove trailing slash as if often found in the host property
                if (parsedValue.endsWith("/"))
                {
                    parsedValue = parsedValue.substr(0, parsedValue.length - 1);
                }

                result[key.trim()] = parsedValue;
            }
        }
        );

        return this.validatedConfig(result);

    }

    validatedConfig(config)
    {

        if (!(config.host && config.access_token && config.client_secret && config.client_token))
        {
            let errorMessage = '';
            const tokens = ['client_token', 'client_secret', 'access_token', 'host'];

            tokens.forEach(function (token)
            {
                if (!config[token])
                {       
                    errorMessage += `Missing: ${token}`;
                }
            }
            );

            throw new Error(`Invalid Configuration! ${errorMessage}`);
        }

        if (config.host.indexOf('https://') > -1)
        {
            return config;
        }

        config.host = 'https://' + config.host;
        return config;

    }

    auth(req)
    {

        let merge = (...args) => {

            // variables
            let target = {};

            // merge the source object with target object
            let merger = (obj) => 
            {
                for (let prop in obj)
                {
                    if (obj.hasOwnProperty(prop))
                    {
                        if (Object.prototype.toString.call(obj[prop]) === '[object Object]')
                        {
                            // if we're doing a deep merge and the property is an object
                            target[prop] = merge(target[prop], obj[prop]);
                        } 
                        else
                        {
                            // otherwise, do a regular merge
                            target[prop] = obj[prop];
                        }
                    }
                }
            };

            //loop through each object and conduct a merge
            for (let i in args)
            {
                merger(args[i]);
            }

            return target;
        };

        let defaults = {
            baseURL: this.config.host
            , url: req.path
            , method: 'GET'
            , headers: {
                'Content-Type': 'application/json'
            }
            , maxRedirects: 0
        };

        let fullReq = merge(defaults, req);

        // convert body object to properly formatted string
        if (fullReq.body)
        {
            fullReq.body = typeof fullReq.body == 'object' ? JSON.stringify(fullReq.body) : fullReq.body;
        }

        this.request = this.generateAuth
        (
            fullReq
            , this.config.client_token
            , this.config.client_secret
            , this.config.access_token
            , this.config.host
        );

        return this;

    }

    generateAuth(request, clientToken, clientSecret, accessToken, host, maxBody, guid, timestamp)
    {

        maxBody = maxBody || 131072;
        guid = guid || Utilities.getUuid();
        timestamp = timestamp || this.createTimestamp();

        request.url = this.makeUrl(host, request.path, request.qs);
        request.headers.Authorization = this.makeAuthHeader(request, clientToken, accessToken, clientSecret, timestamp, guid, maxBody);

        return request;

    }

    twoDigitNumberPad(number)
    {
    
        return String(number).padStart(2, '0');
    
    }

    createTimestamp()
    {

        const date = new Date(Date.now());

        return date.getUTCFullYear() +
            this.twoDigitNumberPad(date.getUTCMonth() + 1) +
            this.twoDigitNumberPad(date.getUTCDate()) +
            'T' +
            this.twoDigitNumberPad(date.getUTCHours()) + ':' +
            this.twoDigitNumberPad(date.getUTCMinutes()) +
            ':' +
            this.twoDigitNumberPad(date.getUTCSeconds()) +
            '+0000';
    
    }

    makeUrl(host, path, qsObj)
    {
        let queryString = '';

        if (qsObj)
        {

            queryString = Object.keys(qsObj).map(key => key + '=' + encodeURIComponent(qsObj[key])).join('&');

        }

        path = !path.includes('?') && qsObj ? `${path}?${queryString}` : path;
        const parsed = new URI(path, host);

        return parsed;

    }

    makeAuthHeader(request, clientToken, accessToken, clientSecret, timestamp, nonce, maxBody)
    {
        const keyValuePairs = {
            client_token: clientToken
            , access_token: accessToken
            , timestamp: timestamp
            , nonce: nonce
        };
        
        let joinedPairs = ''
            , authHeader
            , signedAuthHeader
            , key;

        for (key in keyValuePairs)
        {
            joinedPairs += key + '=' + keyValuePairs[key] + ';';
        }

        authHeader = `EG1-HMAC-SHA256 ${joinedPairs}`;
        signedAuthHeader = authHeader + 'signature=' + this.signRequest(request, timestamp, clientSecret, authHeader, maxBody);

        return signedAuthHeader;
    }

    signRequest(request, timestamp, clientSecret, authHeader, maxBody)
    {

        return this.base64HmacSha256(this.signData(request, authHeader, maxBody), this.signingKey(timestamp, clientSecret));

    }

    canonicalizeHeaders(headers)
    {

        const formattedHeaders = [];

        for (let key in headers)
        {
            formattedHeaders.push(key.toLowerCase() + ':' + headers[key].trim().replace(/\s+/g, ' '));
        }

        return formattedHeaders.join('\t');

    }

    signData(request, authHeader, maxBody)
    {

        const parsedUrl = new URI(request.url);
        const dataToSign = [
                request.method.toUpperCase()
                , parsedUrl.protocol()
                , parsedUrl.hostname()
                , parsedUrl.path() + '?' + parsedUrl.query()
                , this.canonicalizeHeaders(request.headersToSign)
                , this.contentHash(request, maxBody)
                , authHeader
            ];
        
        const dataToSignStr = dataToSign.join('\t').toString();

        return dataToSignStr;

    }

    contentHash(request, maxBody)
    {

        let contentHash = ''
            , preparedBody = request.body || '';

        if (typeof preparedBody === 'object')
        {
            let postDataNew = ''
                , key;

            Logger.log('Body content is type Object, transforming to POST data');

            for (key in preparedBody)
            {
                postDataNew += key + '=' + encodeURIComponent(JSON.stringify(preparedBody[key])) + '&';
            }

            // Strip trailing ampersand
            postDataNew = postDataNew.replace(/&+$/, '');

            preparedBody = postDataNew;
            request.body = preparedBody; // Is this required or being used?
        }

        Logger.log(`Body is ${preparedBody}`);
        Logger.log('PREPARED BODY LENGTH', preparedBody.length);

        if (request.method === 'POST' && preparedBody.length > 0)
        {
            Logger.log(`Signing content: ${preparedBody}`);

            // If body data is too large, cut down to max-body size
            if (preparedBody.length > maxBody)
            {
                Logger.log(`Data length (${preparedBody.length}) is larger than maximum ${maxBody}`);
                preparedBody = preparedBody.substring(0, maxBody);
                Logger.log(`Body truncated. New value ${preparedBody}`);
            }

            Logger.log(`PREPARED BODY ${preparedBody}`);

            contentHash = this.base64Sha256(preparedBody);
            Logger.log(`Content hash is ${contentHash}`);
        }

        return contentHash;

    }

    signingKey(timestamp, clientSecret)
    {

        const key = this.base64HmacSha256(timestamp, clientSecret);
        return key;
    
    }

    base64HmacSha256(data, key)
    {

        const encrypt = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, data, key);
        const encDigest = Utilities.base64Encode(encrypt);

        return encDigest

    }

    base64Sha256(data)
    {

        const shasum = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, data);
        return Utilities.base64Encode(shasum);

    }

    send(callback)
    {

        Logger.log(`Request: ${JSON.stringify(this.request)}`);

        let options = {
            'headers': this.request.headers
            , 'contentType' : 'application/json'
            , 'method': this.request.method
            , 'payload': this.request.body
            , 'muteHttpExceptions': true
        }

        try
        {
            Logger.log(UrlFetchApp.getRequest(this.request.url, options));

            let response = UrlFetchApp.fetch(this.request.url, options)
                , json = response.getContentText()
                , data = JSON.parse(json);

                Logger.log(`Response: ${JSON.stringify(data)}`);
                return JSON.stringify(data);
        }
        catch (e)
        {
            Logger.log(`Error: ${e}`);
            return JSON.stringify(e);
        }

    }

}

function init(obj)
{

    return new EdgeGrid(obj);

}