import { Crawler } from './src/app/crawler';

var inquirer = require('inquirer');
inquirer
  .prompt([
    { type: 'input', message: 'Enter page URL: ', name: 'path' },
    { type: 'number', message: 'Max depth: ', name: 'depth'},
    { type: 'list', message: 'Include assets',  name: 'include', choices: ['yes', 'no']}
  ])
  .then(answers => {
    

    const crawler = new Crawler( answers.path, {
      maxDepth: answers.depth,
      includeAssets: answers.include === 'yes' ? true : false
    });

    console.log('Now scanning...');

    crawler.run().then( scannedResources => {
      console.log(scannedResources);
      console.log('Finished scanning')
    });


  })
  .catch(error => {
    if(error.isTtyError) {
        console.log('Cannot render in current environment');
    }
  });
