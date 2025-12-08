async function findMilestones(user, repo) {
    fetch(
        'https://api.github.com/repos/' + user + '/' + repo + '/milestones', 
        {
            method: 'GET'
        } 
    ); 
}

export {findMilestones}
