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
        console.log("nao ha token");
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

    let permissionObj = obj; // Inicialmente assume o objeto padrão
    let permissionAct = act; // Ação padrão

    //if (req.user.role === "premium") {
      // Se o usuário for premium, autorize 'tasks:anyList' ao invés de 'tasks:defaultList'
    //  permissionObj = "tasks:anyList"; // Permissão para qualquer lista
    //}

    try {
      const allowed = await req.enforcer.enforce(
        req.user.sub, // ID do user (vem do JWT)
        permissionObj,          // relocacurso, ex: "github:milestone"
        permissionAct           // ação, ex: "read"
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
        + 'scope=openid%20email%20https://www.googleapis.com/auth/tasks&'
        
        // parameter state is used to check if the user-agent requesting login is the same making the request to the callback URL
        // more info at https://www.rfc-editor.org/rfc/rfc6749#section-10.12
        + 'state=value-based-on-user-session&'
        
        // responde_type for "authorization code grant"
        + 'response_type=code&'
        
        // redirect uri used to register RP
        // + 'redirect_uri=http://localhost:'+PORT+'/'+CALLBACK
        + 'redirect_uri=http://localhost:' + PORT + '/' + CALLBACK
    );
});

const sessions = new Map();

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

    // temos de tirar dados (basicamente so o access token)
    // da resposta da google, e esta informaçao ta toda no id_token (é um jwt entao damos decode)
    const google_token = jwt.decode(response.id_token);
    // Id da sessao cujos dados vamos guardar para depois.
    // Guardamos estes dados no servidor mm
    const sessionId = crypto.randomUUID();
    // Idk isto nao parece certo acho que temos de mudar a forma como
    // fazemos a atribuiçao do role
    const role = "premium";

    sessions.set(sessionId, {
        //ISTO É MEGA IMPORTANTE PARA CONSEGUIR COMUNICAR COM A API DO GOOGLE TASKS
        access_token: response.access_token,
        //----------------------------------
        refresh_token: response.refresh_token,
        sub: google_token.sub,
        email: google_token.email,
        role: role,
        expiration: Date.now() + (response.expires_in * 1000)
    });

    // ex: if (google_token.email === "prof@uni.pt") role = "premium";

    if (enforcer) {
        await enforcer.addGroupingPolicy(google_token.sub, role);
    }

    const jwt_token = jwt.sign(
        {
            sessionId: sessionId,
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

    console.log(jwt.decode(req.cookies.session));
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

const google = require("googleapis");

app.post("/tasks/default", auth, authorize("tasks:defaultList", "create"), async (req, res) => {
    const { title, dueDate } = req.body;

    if (!title || !dueDate) {
        return res.status(400).json({ error: "Falta título." });
    }

    try {
        console.log("Criando tarefa com os seguintes dados:", { title, dueDate });

        // Obter o access token do Google do usuário
        const sessionInfo = sessions.get(
            jwt.decode(req.cookies.session).sessionId
        );
        const google_access_token = sessionInfo.access_token;

        // Dados da tarefa a ser criada
        const task = {
            title: title,  // Título da tarefa
            due: dueDate,  // Data de vencimento
        };

        // Requisição para obter as listas de tarefas do Google
        const response = await fetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists/", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${google_access_token}`,
            },
        });

        const lists = await response.json();
        if (!lists.items || lists.items.length === 0) {
            return res.status(400).json({ error: "Nenhuma lista de tarefas encontrada" });
        }

        // Considerando a primeira lista de tarefas como a lista padrão
        const defaultListId = lists.items[0].id;

        // Requisição para criar a tarefa na lista padrão
        const createTaskResponse = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${defaultListId}/tasks`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${google_access_token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(task),
        });

        const createdTask = await createTaskResponse.json();

        if (createTaskResponse.ok) {
            // Retornar a tarefa criada com sucesso
            res.json({
                message: "Tarefa criada com sucesso",
                taskId: createdTask.id,  // ID da tarefa criada
                taskTitle: createdTask.title,  // Título da tarefa
                taskDueDate: createdTask.due,  // Data de vencimento da tarefa
            });
        } else {
            res.status(createTaskResponse.status).json({
                error: "Erro ao criar tarefa",
                detail: createdTask,
            });
        }
    } catch (err) {
        console.error("Erro ao criar tarefa no Google Tasks:", err);
        res.status(500).json({ error: "Erro interno ao criar tarefa", detail: err.message });
    }
});



// criar tarefa em qualquer lista – só premium
app.post(
    '/tasks/custom',
    auth,
    authorize("tasks:anyList", "create"),
    async (req, res) => {

        const { title, dueDate, listTitle } = req.body; // Obtendo tasklistId da requisição
        console.log(req.body);
        console.log(title);
        console.log(dueDate);
        console.log(listTitle);

        if (!title || !listTitle) {
            return res.status(400).json({ error: "Falta título ou nome da lista" });
        }

        try {
            console.log("Criando tarefa com os seguintes dados:", { title, dueDate, listTitle });

            // Obter o access token do Google do usuário
            const sessionInfo = sessions.get(
                jwt.decode(req.cookies.session).sessionId
            );
            const google_access_token = sessionInfo.access_token;
            console.log("GOOGLE ACCESS TOKEN");
            console.log(google_access_token);

            // Dados da tarefa a ser criada
            const task = {
                title: title,  // Título da tarefa
                due: dueDate,  // Data de vencimento
            };

            // Sacar a lista
            const listsResponse = await fetch(
                'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
                {
                    headers: { 'Authorization': `Bearer ${google_access_token}` }
                }
            );
            const lists = await listsResponse.json();

            const myList = lists.items.find(list => list.title === listTitle);
            console.log(myList);
            const listId = myList.id;
            console.log("LIST ID: " + listId)

            // Requisição para criar a tarefa na lista especificada
            const createTaskResponse = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${google_access_token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(task),
            });

            const createdTask = await createTaskResponse.json();

            if (createTaskResponse.ok) {
                // Retornar a tarefa criada com sucesso
                res.json({
                    message: "Tarefa criada com sucesso",
                    taskId: createdTask.id,  // ID da tarefa criada
                    taskTitle: createdTask.title,  // Título da tarefa
                    taskDueDate: createdTask.due,  // Data de vencimento da tarefa
                });
            } else {
                res.status(createTaskResponse.status).json({
                    error: "Erro ao criar tarefa",
                    detail: createdTask,
                });
            }
        } catch (err) {
            console.error("Erro ao criar tarefa no Google Tasks:", err);
            res.status(500).json({ error: "Erro interno ao criar tarefa", detail: err.message });
        }
    }
);

app.get('/tasks/list', async (req, res) => {

    const sessionInfo = sessions.get(
        jwt.decode(req.cookies.session).sessionId
    );
    const google_access_token = sessionInfo.access_token;

    const response = await fetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists", {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${google_access_token}`
        }
    })

    console.log("LISTAS:");
    console.log(await response.json());
})


app.listen(PORT, (err) => {
    if (err) {
        return console.log('something bad happened', err)
    }
    console.log(`server is listening on ${PORT}`)
});
