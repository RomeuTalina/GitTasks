const express = require('express');

const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken')
require('dotenv').config();

const PORT = 3001;

const CLIENT_ID = process.env.CLIENT_ID
const CLIENT_SECRET = process.env.CLIENT_SECRET
const CALLBACK = "callback"

console.log(CLIENT_ID)
console.log(CLIENT_SECRET)

const app = express()
app.use(cookieParser())

app.get('/', (req, res) => {
    res.send('<a href=/login>BOTAO</a>');
})

app.get('/login', (req, res) => {
    res.redirect(302, 
        
        // authorization endpoints
        'https://accounts.google.com/o/oauth2/v2/auth?'
        
        // client id
        + 'client_id='+ CLIENT_ID +'&'
        
        // OpenID scope "openid email"
        + 'scope=openid%20email&'
        
        // parameter state is used to check if the user-agent requesting login is the same making the request to the callback URL
        // more info at https://www.rfc-editor.org/rfc/rfc6749#section-10.12
        + 'state=value-based-on-user-session&'
        
        // responde_type for "authorization code grant"
        + 'response_type=code&'
        
        // redirect uri used to register RP
        // + 'redirect_uri=http://localhost:'+PORT+'/'+CALLBACK
        + 'redirect_uri=http://localhost:' + PORT + '/' + CALLBACK
    );
})

app.get('/callback', async (req, res) => {

    const form = new FormData();
    form.append('code', req.query.code);
    form.append('client_id', CLIENT_ID);
    form.append('client_secret', CLIENT_SECRET);
    form.append('redirect_uri', 'http://localhost:' + PORT + '/' + CALLBACK);
    form.append('grant_type', 'authorization_code');

    // Convert FormData to a URL-encoded string
    const urlEncodedBody = new URLSearchParams(form).toString();

    const response = await fetch('https://oauth2.googleapis.com/token', {

        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: urlEncodedBody
    })
    .then(response => response.json())
    .then(data => {
        var jwt = jwt.decode(data.id_token);
        res.send(
            '<div> callback with code = <code>' + req.query.code + '</code></div><br>' +
            '<div> client app received access code = <code>' + data.access_token + '</code></div><br>' +
            '<div> id_token = <code>' + data.id_token + '</code></div><br>' +
            '<div> Hi <b>' + jwt.email + '</b> </div><br>' +
            'Go back to <a href="/">Home screen</a>'
        );
    })
    console.log(response)
})

app.listen(PORT, (err) => {
    if (err) {
        return console.log('something bad happened', err)
    }
    console.log(`server is listening on ${PORT}`)
})
