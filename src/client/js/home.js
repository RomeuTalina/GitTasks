const listForm = document.getElementById("listForm");


listForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    console.log("submit");

    const username = document.getElementById('userField').value;
    const repo = document.getElementById('repoField').value;

    requestBody = {
        'user': username,
        'repo': repo
    };

    console.log(requestBody);

    response = await fetch('http://localhost:3001/list', {
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        // Tens de transformar em string
        body: JSON.stringify(requestBody)
    });
});
