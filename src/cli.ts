import { type CAC, cac } from 'cac';
import pkg from '../package.json' with { type: 'json' };

export function createCli(): CAC {
  const cli = cac('questspec');

  cli
    .command('[...args]', 'Compile and validate declarative Minecraft questbooks')
    .action((args: string[]) => {
      if (args.length > 0) {
        throw new Error(`questspec: unknown command '${args[0]}'`);
      }

      cli.outputHelp();
    });

  cli.help().version(pkg.version);
  return cli;
}
