

const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose(); // Importa o Banco de Dados

const app = express();
const PORT = 5000;

app.use(cors({
    origin: '*', // Permite acessos de qualquer porta (5500, 5000, etc)
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
}));
app.use(express.json());
app.use(express.static(__dirname));

// 1. INICIALIZAÇÃO DO BANCO DE DADOS (Cria o arquivo banco.db automaticamente)
const db = new sqlite3.Database('./banco.db', (err) => {
    if (err) console.error("Erro ao abrir banco:", err.message);
    else console.log("Banco de dados SQLite conectado com sucesso!");
});

// Cria as tabelas necessárias se elas não existirem
db.serialize(() => {
    // Tabela de Lojas com controle de Status (Ativo/Inativo) e Senha
    db.run(`CREATE TABLE IF NOT EXISTS lojas (
        usuario TEXT PRIMARY KEY,
        senha TEXT,
        status TEXT DEFAULT 'ativo'
    )`);

    // Tabela de Produtos vinculada à Loja
    db.run(`CREATE TABLE IF NOT EXISTS produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        quantidade INTEGER,
        preco REAL,
        usuario TEXT
    )`);

    // Insere dados de teste se o banco estiver vazio
    db.get("SELECT COUNT(*) as qtd FROM lojas", (err, row) => {
        if (row.qtd === 0) {
            db.run("INSERT INTO lojas (usuario, senha, status) VALUES ('loja1', '1234', 'ativo')");
            db.run("INSERT INTO lojas (usuario, senha, status) VALUES ('loja2', '4321', 'inativo')"); // Começa travada para testar
            db.run("INSERT INTO produtos (nome, quantidade, preco, usuario) VALUES ('Camiseta Preta', 10, 49.90, 'loja1')");
        }
    });
});

// 2. ROTA DE LOGIN (Verifica senha e se a loja está ativa)
app.post('/api/login', (req, res) => {
    const { usuario, senha } = req.body;
    db.get("SELECT * FROM lojas WHERE usuario = ?", [usuario], (err, loja) => {
        if (err) return res.status(500).json({ erro: "Erro no banco" });
        if (!loja || loja.senha !== senha) return res.status(401).json({ erro: "Usuário ou senha incorretos" });
        
        // Bloqueia o login se o status for inativo
        if (loja.status === 'inativo') {
            return res.status(403).json({ erro: "BLOQUEADO", mensagem: "Sua assinatura está vencida. Regularize o pagamento!" });
        }
        
        res.json({ sucesso: true, usuario: loja.usuario });
    });
});

// 3. BUSCAR PRODUTOS (Protegido: Verifica se a loja continua ativa)
app.get('/api/produtos', (req, res) => {
    const { usuario } = req.query;
    
    db.get("SELECT status FROM lojas WHERE usuario = ?", [usuario], (err, loja) => {
        if (!loja || loja.status === 'inativo') return res.status(403).json({ erro: "Conta Inativa" });

        db.all("SELECT * FROM produtos WHERE usuario = ?", [usuario], (err, rows) => {
            res.json(rows);
        });
    });
});

// 4. CADASTRAR PRODUTO NO BANCO
app.post('/api/produtos', (req, res) => {
    const { nome, quantidade, preco, usuario } = req.body;
    db.run("INSERT INTO produtos (nome, quantidade, preco, usuario) VALUES (?, ?, ?, ?)", 
        [nome, Number(quantidade), Number(preco), usuario], 
        function(err) { res.status(201).json({ id: this.lastID }); }
    );
});

// 5. ATUALIZAR ESTOQUE NO BANCO
app.patch('/api/produtos/:id', (req, res) => {
    const { id } = req.params;
    const { quantidade, usuario } = req.body;
    db.run("UPDATE produtos SET quantidade = ? WHERE id = ? AND usuario = ?", 
        [Number(quantidade), id, usuario], 
        () => res.json({ sucesso: true })
    );
});

// 6. ROTA DE WEBHOOK (Simula o Asaas/Stripe bloqueando ou desbloqueando o cliente)
// Para testar, você enviará um comando dizendo se o cliente pagou ou atrasou
app.post('/api/webhook-pagamento', (req, res) => {
    const { usuario, evento } = req.body; // evento pode ser: "pago" ou "atrasado"
    const novoStatus = evento === 'pago' ? 'ativo' : 'inativo';

    db.run("UPDATE lojas SET status = ? WHERE usuario = ?", [novoStatus, usuario], (err) => {
        if (err) return res.status(500).send("Erro");
        console.log(`[WEBHOOK] A loja ${usuario} foi atualizada para: ${novoStatus}`);
        res.send("Status atualizado via Webhook!");
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor ativo na porta ${PORT}`));
