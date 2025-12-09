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
        console.log("fuck you buddy");
        return res.status(401).json({ error: "Token não encontrado" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // coloca dados do user na request
        console.log("auth successful");
        next();
    } catch (err) {
        return res.status(401).json({ error: "Token inválido ou expirado" });
    }
}

const { newEnforcer } = require("casbin");
const path = require("path");


let enforcer; // variável global para guardar o enforcer

async function initCasbin() {
    const modelPath = path.join(__dirname, "casbin", "model.conf");
    const policyPath = path.join(__dirname, "casbin", "policy.csv");

    // não precisas de FileAdapter, passas só os paths
    enforcer = await newEnforcer(modelPath, policyPath);
    console.log("Casbin pronto");
}


initCasbin().catch(err => {
    console.error("Erro a iniciar Casbin:", err);
});

//verifica no casbin se o user com este sub pode fazer esta act neste obj
function authorize(obj, act) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }
    if (!req.enforcer) {
      return res.status(500).json({ error: "Enforcer não disponível" });
    }

    console.log("Autorizando o usuário com o papel:", req.user.role);  // Log do role

    try {
      const allowed = await req.enforcer.enforce(
        req.user.sub, // ID do user (vem do JWT)
        obj,          // recurso, ex: "github:milestone"
        act           // ação, ex: "read"
      );

      if (!allowed) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      next();
    } catch (err) {
      console.error("Erro no Casbin:", err);
      return res.status(500).json({ error: "Erro interno de autorização" });
    }
  };
}



const app = express();
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..", "client")));

app.get('/', (req, res) => {
    console.log(__dirname);
    res.sendFile(path.join(__dirname, '../client/html/landing.html'));
})

// Casbin no req
app.use((req, res, next) => {
    req.enforcer = enforcer;
    next();
});

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

    const role = "regular";
    // ex: if (google_token.email === "prof@uni.pt") role = "premium";

    if (enforcer) {
        await enforcer.addGroupingPolicy(google_token.sub, role);
    }

    const jwt_token = jwt.sign(
        {
            sub: google_token.sub,
            email: google_token.email,
            role: role
        },
        process.env.JWT_SECRET,
        {expiresIn: "1h"}
    );

    res.cookie("session", jwt_token, {
        httpOnly: false,
        secure: false,
        sameSite: "strict"
    });

    res.send(
        '<div>muito poggers mano</div>'+
        '<br><br>'+
        '<a href=/home>HOME</a>'
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

//Todos os endpoints que precisarem de ler json têm de ficar dps disto
app.use(express.json());

app.post('/list', (req, res) => {

    console.log("post to /list");
    console.log(req.body);
    res.json({
        status: "ok",
        user: req.body.user,
        repo: req.body.repo
    });
});


// ver milestones – todos com papel que tenha p, <role>, github:milestone, read
app.get(
  '/github/milestones',
  auth,
  authorize("github:milestone", "read"),
  async (req, res) => {
    const { user, repo } = req.query;

    if (!user || !repo) {
      return res.status(400).json({ error: "Falta user ou repo" });
    }

    const url = `https://api.github.com/repos/${user}/${repo}/milestones`;

    try {
      const ghRes = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github+json'
        }
      });

      const bodyText = await ghRes.text();
      console.log("GitHub status:", ghRes.status);
      console.log("GitHub body:", bodyText);

      if (!ghRes.ok) {
        return res
          .status(ghRes.status)
          .json({ error: "Erro a obter milestones do GitHub", detail: bodyText });
      }

      const milestones = JSON.parse(bodyText);
      res.json(milestones);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erro interno a falar com o GitHub" });
    }
  }
);


// criar tarefa na lista default – regular/premium
app.post(
    '/tasks/default',
    auth,
    authorize("tasks:defaultList", "create"),
    (req, res) => {
        // aqui depois crias tarefa na lista "default" do Google Tasks
        res.json({ message: "Tarefa criada com sucesso" });
    }
);

// criar tarefa em qualquer lista – só premium
app.post(
    '/tasks/custom',
    auth,
    authorize("tasks:anyList", "create"),
    (req, res) => {
        // aqui crias tarefa numa lista escolhida pelo user
        res.send("criou numa lista custom");
    }
);

app.listen(PORT, (err) => {
    if (err) {
        return console.log('something bad happened', err)
    }
    console.log(`server is listening on ${PORT}`)
});

const { google } = require("googleapis");

app.post("/tasks/default", auth, authorize("tasks:defaultList", "create"), async (req, res) => {
  const { title, dueDate } = req.body;

  if (!dueDate) {
    return res.status(400).json({ error: "Falta a data de vencimento da tarefa" });
  }

  try {
    console.log("Criando tarefa com os seguintes dados:", { title, dueDate });

    // Log do access_token para garantir que está correto
    console.log("Access token que estamos usando:", req.user.accessToken);

    // Inicializa o Google Tasks API com o token de acesso
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: req.user.accessToken,  // O token de acesso do Google
    });

    const tasks = google.tasks({ version: "v1", auth: oauth2Client });

    const task = {
      title: title,   // Título fixo
      due: dueDate,   // A data de vencimento
    };

    // Aguarda a resposta da API do Google Tasks
    const response = await tasks.tasks.insert({
      tasklist: "@default",  // Ou o nome da lista que você quiser
      resource: task,
    });

    // Aqui vamos garantir que a resposta está correta
    console.log("Resposta da criação de tarefa do Google Tasks:", response.data);

    // Retorna a resposta para o cliente
    res.json({
      message: "Tarefa criada com sucesso",
      taskId: response.data.id, // Você pode devolver o ID da tarefa criada
      taskTitle: response.data.title, // O título da tarefa
      taskDueDate: response.data.due, // Data de vencimento da tarefa
    });

  } catch (err) {
    console.error("Erro ao criar tarefa no Google Tasks:", err);
    if (err.response) {
      console.error("Erro detalhado do Google Tasks:", err.response.data);  // Mostra a resposta de erro da API
    }
    res.status(500).json({ error: "Erro ao criar tarefa no Google Tasks", detail: err.message });
  }
});




