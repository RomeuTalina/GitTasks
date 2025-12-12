const listForm = document.getElementById("listForm");
const resultDiv = document.getElementById("result");

const role = getUserRole();

const botao = document.getElementById("listas");

botao.addEventListener("click", async (e) => {
    e.preventDefault(); 

    const response = await fetch("/tasks/list",  {
        method: 'GET'
    }) 
})

listForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  console.log("submit");

  const username = document.getElementById("userField").value;
  const repo = document.getElementById("repoField").value;

  if (!username || !repo) {
    resultDiv.textContent = "Preenche o user e o repo.";
    return;
  }

  try {
    // chama o endpoint protegido no servidor
    const response = await fetch(
      `/github/milestones?user=${encodeURIComponent(username)}&repo=${encodeURIComponent(repo)}`
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      resultDiv.textContent = err.error || `Erro: ${response.status}`;
      return;
    }

    const milestones = await response.json(); // é um array

    // limpar o div
    resultDiv.innerHTML = "";

    if (!Array.isArray(milestones) || milestones.length === 0) {
      resultDiv.textContent = "Nenhum milestone encontrado.";
      return;
    }

    console.log("" + milestones);
    // Mostrar cada milestone com botão
    milestones.forEach((m) => {
        const div = document.createElement("div");
        div.textContent = `#${m.number} – ${m.title}`;

      // Verificar o papel do usuário antes de adicionar o botão
        console.log("Chamando a função getUserRole");
        const userRole = getUserRole();
        console.log("User Role:", userRole);

        if (userRole !== "free") {  // Apenas usuários que não são "free" podem criar tarefas
            const button = document.createElement("button");
            button.textContent = "Criar Tarefa";
            button.addEventListener("click", () => createTask(m));

            // Adicionar o botão ao div
            div.appendChild(button);
        }

        resultDiv.appendChild(div);
    });

  } catch (err) {
    console.error(err);
    resultDiv.textContent = "Erro a falar com o servidor.";
  }
});

function createTask(milestone) {
    if(role === "regular") {
        createTaskDefault(milestone);
    } 
    else if (role === "premium") {
        createTaskCustom(milestone);                     
    }
}

async function createTaskCustom(milestone) {

    const listNameField = document.createElement("input");
    listNameField.placeholder = "Nome da Lista";
    document.body.appendChild(listNameField);
    let listTitle = "@default";
    listNameField.addEventListener("input", () => {
        listTitle = listNameField.value;
    })

    const submitButton = document.createElement("button"); // Botao para criar a tarefa na lista escolhida
    submitButton.textContent = "Criar";
    submitButton.addEventListener("click", async () => {

        try {
            
            const response = await fetch("/tasks/custom", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    title: milestone.title, // Texto fixo
                    dueDate: milestone.due_on,  // A data de vencimento da milestone
                    listTitle: listTitle
                })
            });

            if (!response.ok) {
                // Logar o erro da resposta
                const errorDetails = await response.json();
                console.error("Erro no servidor:", errorDetails);
                alert("Erro ao criar tarefa: " + (errorDetails.error || "Erro desconhecido"));
                return;
            }

            const result = await response.json(); // A resposta será um objeto JSON
            console.log("Resposta da criação de tarefa:", result); // Aqui você verifica a resposta

            // Acessando o valor de 'message' diretamente do objeto
            alert(result.message);  // Aqui acessamos o 'message' diretamente
        }catch (err){
            console.log("Sei la bro deu erro olha");
        }
    })
    document.body.appendChild(submitButton);
}

// Função para criar a tarefa
async function createTaskDefault(milestone) {

    try {
        const response = await fetch("/tasks/default", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                title: milestone.title, // Texto fixo
                dueDate: milestone.due_on,  // A data de vencimento da milestone
            }),
        });

        if (!response.ok) {
            // Logar o erro da resposta
            const errorDetails = await response.json();
            console.error("Erro no servidor:", errorDetails);
            alert("Erro ao criar tarefa: " + (errorDetails.error || "Erro desconhecido"));
            return;
        }

        const result = await response.json(); // A resposta será um objeto JSON
        console.log("Resposta da criação de tarefa:", result); // Aqui você verifica a resposta

        // Acessando o valor de 'message' diretamente do objeto
        alert(result.message);  // Aqui acessamos o 'message' diretamente
    } catch (err) {
        console.error("Erro ao criar tarefa:", err);
        alert("Erro ao criar tarefa.");
    }
}


    // // Caso o utilizador tenha o plano premium
    // else {
    //     const listNameField = document.createElement("input");
    //     listNameField.placeholder = "List Name";
    //
    // }


// Função para obter o papel do usuário a partir do JWT no cookie
function getUserRole() {
    const token = document.cookie.split(';').find(row => row.startsWith('session='));

    if (!token) {
        console.log("Token não encontrado.");
        return null;
    }

    const jwtToken = token.split('=')[1];

    try {
        const decodedToken = JSON.parse(atob(jwtToken.split('.')[1]));  // Decodificar o JWT (sem verificação)
        console.log("Decoded Token:", decodedToken);  // Log para ver a estrutura do token

        return decodedToken.role; // Acessar o papel no payload do JWT
    } catch (error) {
        console.error("Erro ao decodificar JWT:", error);
        return null;
    }
}



