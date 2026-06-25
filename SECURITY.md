# Política de Segurança

## Reportando uma Vulnerabilidade

Agradecemos sua colaboração para manter este projeto seguro. Se você descobrir qualquer problema ou vulnerabilidade de segurança, **não abra uma issue pública**. 

Por favor, reporte a vulnerabilidade enviando um e-mail diretamente para o proprietário do repositório (ou através de canais de contato privado).

Nós tentaremos responder e validar os relatórios em até 48 horas e trabalharemos em uma correção o mais rápido possível.

## Práticas de Segurança Recomendadas

Este repositório consome APIs externas e armazena credenciais confidenciais. Siga as orientações abaixo ao executar ou estender o código:
- **Nunca comite chaves de API ou senhas:** O arquivo `.env` está no `.gitignore` para evitar que segredos sejam expostos no GitHub. Utilize apenas o `.env.example` como referência de estrutura.
- **Validação de Inputs:** Endpoints que aceitam caminhos de arquivos ou URLs (como o webhook `/webhooks/recording`) utilizam validações rígidas para evitar vulnerabilidades de injeção de comandos locais ou acesso não autorizado a diretórios privados (Path Traversal).
