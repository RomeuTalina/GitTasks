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

// É obrigatório usar isto em todos os acessos novos que criarmos (gets e posts), tens um exemplo no get to /test
function auth(req, res, next) {
    const token = req.cookies.session;  // cookie onde gravaste o token

    if (!token) {
        return res.status(401).json({ error: "Token não encontrado" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // coloca dados do user na request
        next();
    } catch (err) {
        return res.status(401).json({ error: "Token inválido ou expirado" });
    }
}

const path = require("path");

const app = express()
app.use(cookieParser())

app.get('/', (req, res) => {
    console.log(__dirname);
    res.sendFile(path.join(__dirname, '../client/html/landing.html'));
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

    const google_token = jwt.decode(response.id_token);
    console.log(google_token);

    const jwt_token = jwt.sign(
        {
            sub: google_token.sub,
            email: google_token.email
        },
        process.env.JWT_SECRET,
        {expiresIn: "1h"}
    );

    res.cookie("session", jwt_token, {
        httpOnly: true,
        secure: true,
        sameSite: "strict"
    });

    res.send(
        '<div>muito poggers mano</div>'
    );
});

// passas a referência à função auth aqui no meio e isto faz a validação conforma a função la em cima
app.get('/test', auth, (req, res) => {

    res.send(
        '<div>Is this thing on lol</div>'
    );
});

app.get('/home', auth, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/html/home.html'));
});

app.post('/list', auth, (req, res) => {

    console.log(req.body.user);
});

app.listen(PORT, (err) => {
    if (err) {
        return console.log('something bad happened', err)
    }
    console.log(`server is listening on ${PORT}`)
})
