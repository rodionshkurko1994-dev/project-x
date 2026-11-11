#!/bin/sh
# Збирає supabase/functions/game/index.ts із спільної логіки світу та серверної логіки.
cd "$(dirname "$0")/.." || exit 1
F=supabase/functions/game
{
  cat $F/head.js
  node -e "
    const fs=require('fs');const s=fs.readFileSync('js/data.js','utf8');
    const c=s.slice(0,s.indexOf('\nconst MAP='));console.log(c);
    console.log('const MASK=' + JSON.stringify(fs.readFileSync('$F/mask.txt','utf8').trim()) + ';');"
  cat js/core.js $F/logic.js $F/serve.js
} > $F/index.ts
wc -c $F/index.ts
