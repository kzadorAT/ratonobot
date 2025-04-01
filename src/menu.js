import { input, select } from '@inquirer/prompts';

const mainMenu = async () => {
  const action = await select({
    message: 'Selecciona una acción:',
    choices: [
      { name: 'Opción 1', value: 'option1' },
      { name: 'Opción 2', value: 'option2' },
      { name: 'Salir', value: 'exit' }
    ]
  });

  switch (action) {
    case 'option1':
      console.log('Has seleccionado la Opción 1');
      break;
    case 'option2':
      console.log('Has seleccionado la Opción 2');
      break;
    case 'exit':
      console.log('Saliendo...');
      process.exit(0);
  }
};

mainMenu();
