/**
 * JSDB - メインクラス
 * ブラウザで動作する軽量SQLデータベース
 */
class JSDB {
    constructor(dbName) {
        if (!dbName) {
            throw new Error('Database name is required');
        }

        this.dbName = dbName;
        this.dbManager = new IndexedDBManager(dbName);
        this.executor = null;
        this.initialized = false;
    }

    /**
     * データベースを初期化
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            await this.dbManager.open();
            this.executor = new Executor(this.dbManager);
            this.initialized = true;
        } catch (error) {
            throw new Error(`Failed to initialize database: ${error.message}`);
        }
    }

    /**
     * SQL文を実行
     * @param {string} sql - SQL文
     * @param {Array|Object} params - プレースホルダーのパラメータ（配列または名前付きオブジェクト）
     */
    async execute(sql, params = null) {
        if (!sql || typeof sql !== 'string') {
            throw new Error('SQL statement is required and must be a string');
        }

        // 初期化されていない場合は初期化
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            // トークン化
            const tokenizer = new Tokenizer(sql);
            const tokens = tokenizer.tokenize();

            // パース
            const parser = new Parser(tokens);
            const statement = parser.parse();

            // 実行（パラメータを渡す）
            const result = await this.executor.execute(statement, params);

            return result;
        } catch (error) {
            throw new Error(`SQL execution failed: ${error.message}`);
        }
    }

    /**
     * データベースを閉じる
     */
    close() {
        if (this.dbManager) {
            this.dbManager.close();
            this.initialized = false;
        }
    }

    /**
     * データベースを削除
     */
    static async deleteDatabase(dbName) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(dbName);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(new Error(`Failed to delete database: ${request.error}`));
            };

            request.onblocked = () => {
                reject(new Error('Database deletion blocked. Close all connections first.'));
            };
        });
    }

    /**
     * 利用可能なデータベース一覧を取得
     * @returns {Promise<string[]>} データベース名の配列
     */
    static async listDatabases() {
        if (indexedDB.databases) {
            const databases = await indexedDB.databases();
            return databases.map(db => db.name);
        } else {
            throw new Error('listDatabases is not supported in this browser (requires Chrome/Edge)');
        }
    }
}
