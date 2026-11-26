# Project memory

## Product intent & audience

- Sistema de gestão acadêmica (escola/curso), com foco em relatórios de alunos.
- Suporta alunos EAD (Ensino a Distância) com marcação manual de status e conclusão.
- Público: equipe administrativa/coordenadores que consultam e exportam relatórios de frequência e situação.

## Brand personality & voice

- Comunicação direta e funcional, em português (pt-BR).
- Respostas orientadas a resultado: descrever o que mudou, onde, e confirmar compilação.

## Visual design & UX direction

- Tabela de relatório com colunas distintas: **SITUAÇÃO** (resultado final visível) e **STATUS MANUAL / STATUS EAD** (marcação operacional).
- Badges/selos coloridos para situação: "CONCLUÍDO" em azul, "FREQUENTE" e "AUSENTE" com estilos próprios.
- Exportações PDF e XLSX devem espelhar visualmente as regras da tela (incluindo destaque azul para CONCLUÍDO no PDF).
- Componente principal: `src/components/academico/ReportsTab.tsx`.

## Decisions, constraints & rationale

- **SITUAÇÃO exibe "CONCLUÍDO"** quando aluno EAD marcado como concluído, sobrepondo FREQUENTE/AUSENTE.
- **STATUS MANUAL (EAD) permanece intocável** pela regra de conclusão — continua refletindo apenas frequência marcada manualmente.
- Regra aplicada de forma consistente em tabela, PDF e XLSX.
- No PDF, a sobreposição é na coluna SITUAÇÃO (última coluna), mantendo STATUS EAD como era.
- Projeto usa Vite + React; compilação deve ser verificada após mudanças.

## Open questions & assumptions

- Assume-se que "concluído" é um estado derivado de uma flag/campo existente no aluno EAD; origem exata desse campo não confirmada.
- Não há `.bolt/prompt` configurado — toda a base de instruções vem do contexto das conversas.
- Comportamento para alunos não-EAD com conclusão não foi abordado; regra atual aplica-se apenas a EAD.