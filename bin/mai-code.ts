#!/usr/bin/env node
import { createCLI } from '../src/cli/args.js';

const program = createCLI();
program.parse(process.argv);
