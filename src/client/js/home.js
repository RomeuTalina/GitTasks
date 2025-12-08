const listForm = document.getElementById("listForm");


listForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('userField').value;
    const repo = document.getElementById('repoField').value;

    requestBody = {
        'user': username,
        'repo': repo
    };

    response = await fetch('http://localhost:3001/list', {
        method: 'POST',
        headers: {
            'ContentType': 'application/json' 
        },
        body: {
            requestBody      
        }
    });
});
