/**
 * ヘルパー関数
 */

/**
 * データ型を検証
 */
function validateDataType(value, type) {
    switch (type.toUpperCase()) {
        case 'INTEGER':
            return Number.isInteger(value);
        case 'REAL':
            return typeof value === 'number';
        case 'TEXT':
            return typeof value === 'string';
        case 'BLOB':
            return value instanceof Blob ||
                   value instanceof ArrayBuffer ||
                   value instanceof Uint8Array ||
                   ArrayBuffer.isView(value);
        case 'DATE':
        case 'DATETIME':
            return value instanceof Date || !isNaN(Date.parse(value));
        default:
            return true; // 不明な型は許可
    }
}

/**
 * データ型に変換
 */
function convertToDataType(value, type) {
    if (value === null || value === undefined) {
        return null;
    }

    switch (type.toUpperCase()) {
        case 'INTEGER':
            return parseInt(value, 10);
        case 'REAL':
            return parseFloat(value);
        case 'TEXT':
            return String(value);
        case 'BLOB':
            return convertToArrayBuffer(value);
        case 'DATE':
        case 'DATETIME':
            return new Date(value);
        default:
            return value;
    }
}

/**
 * バイナリデータを ArrayBuffer に変換
 */
async function convertToArrayBuffer(value) {
    if (value instanceof ArrayBuffer) {
        return value;
    }
    if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    if (value instanceof Blob) {
        return await value.arrayBuffer();
    }
    throw new Error('Unsupported BLOB data type');
}

/**
 * バイナリデータを同期的に ArrayBuffer に変換（プレースホルダー用）
 */
function convertToArrayBufferSync(value) {
    if (value instanceof ArrayBuffer) {
        return value;
    }
    if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    // Blob は非同期なので、そのまま返す（後で Executor で処理）
    if (value instanceof Blob) {
        return value;
    }
    throw new Error('Unsupported BLOB data type');
}

/**
 * 値を比較
 */
function compareValues(left, operator, right) {
    // NULL チェック
    if (left === null || left === undefined || right === null || right === undefined) {
        if (operator === '=' || operator === '==') {
            return left === right;
        } else if (operator === '!=' || operator === '<>') {
            return left !== right;
        }
        return false;
    }

    // 日付型の比較（Date オブジェクトの場合）
    if (left instanceof Date || right instanceof Date) {
        const leftTime = left instanceof Date ? left.getTime() : new Date(left).getTime();
        const rightTime = right instanceof Date ? right.getTime() : new Date(right).getTime();
        
        switch (operator) {
            case '=':
            case '==':
                return leftTime === rightTime;
            case '!=':
            case '<>':
                return leftTime !== rightTime;
            case '>':
                return leftTime > rightTime;
            case '<':
                return leftTime < rightTime;
            case '>=':
                return leftTime >= rightTime;
            case '<=':
                return leftTime <= rightTime;
            default:
                throw new Error(`Unknown operator: ${operator}`);
        }
    }

    switch (operator) {
        case '=':
        case '==':
            return left == right;
        case '!=':
        case '<>':
            return left != right;
        case '>':
            return left > right;
        case '<':
            return left < right;
        case '>=':
            return left >= right;
        case '<=':
            return left <= right;
        default:
            throw new Error(`Unknown operator: ${operator}`);
    }
}

/**
 * LIKE パターンマッチング
 */
function matchLike(value, pattern) {
    if (value === null || value === undefined) {
        return false;
    }
    
    // 値を文字列に変換
    const str = String(value);
    
    // SQL の LIKE パターンを正規表現に変換
    // % は .* (任意の文字列)、_ は . (任意の1文字) に変換
    const regexPattern = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // 特殊文字をエスケープ
        .replace(/%/g, '.*')  // % を .* に変換
        .replace(/_/g, '.');  // _ を . に変換
    
    const regex = new RegExp('^' + regexPattern + '$', 'i'); // 大文字小文字を区別しない
    return regex.test(str);
}

/**
 * WHERE 条件を評価
 */
function evaluateWhereCondition(row, condition) {
    if (!condition) {
        return true;
    }

    // 論理演算子の処理
    if (condition.type === 'AND') {
        return evaluateWhereCondition(row, condition.left) &&
               evaluateWhereCondition(row, condition.right);
    }
    if (condition.type === 'OR') {
        return evaluateWhereCondition(row, condition.left) ||
               evaluateWhereCondition(row, condition.right);
    }

    // LIKE 演算の処理
    if (condition.type === 'LIKE') {
        const leftValue = row[condition.left];
        const pattern = condition.pattern;
        return matchLike(leftValue, pattern);
    }

    // 比較演算の処理
    if (condition.type === 'COMPARISON') {
        const leftValue = row[condition.left];
        const rightValue = condition.right;
        return compareValues(leftValue, condition.operator, rightValue);
    }

    return true;
}

/**
 * エラーメッセージを生成
 */
function createError(message, details = null) {
    const error = new Error(message);
    if (details) {
        error.details = details;
    }
    return error;
}
/**
 * IndexedDBManager - IndexedDB の操作を管理するクラス
 */
class IndexedDBManager {
    constructor(dbName) {
        this.dbName = dbName;
        this.db = null;
        this.version = null;
    }

    /**
     * データベースを開く
     */
    async open() {
        return new Promise((resolve, reject) => {
            // まず現在のバージョンを取得
            const openRequest = indexedDB.open(this.dbName);
            
            openRequest.onsuccess = () => {
                const db = openRequest.result;
                this.version = db.version;
                db.close();
                
                // 正しいバージョンで再オープン
                const request = indexedDB.open(this.dbName, this.version);

                request.onerror = () => {
                    reject(new Error(`Failed to open database: ${request.error}`));
                };

                request.onsuccess = () => {
                    this.db = request.result;
                    resolve(this.db);
                };

                request.onupgradeneeded = (event) => {
                    this.db = event.target.result;
                    
                    if (!this.db.objectStoreNames.contains('__metadata__')) {
                        this.db.createObjectStore('__metadata__', { keyPath: 'key' });
                    }
                };
            };
            
            openRequest.onerror = () => {
                // データベースが存在しない場合は新規作成
                this.version = 1;
                const request = indexedDB.open(this.dbName, this.version);

                request.onerror = () => {
                    reject(new Error(`Failed to open database: ${request.error}`));
                };

                request.onsuccess = () => {
                    this.db = request.result;
                    resolve(this.db);
                };

                request.onupgradeneeded = (event) => {
                    this.db = event.target.result;
                    
                    if (!this.db.objectStoreNames.contains('__metadata__')) {
                        this.db.createObjectStore('__metadata__', { keyPath: 'key' });
                    }
                };
            };
        });
    }

    /**
     * テーブル（オブジェクトストア）を作成
     */
    async createTable(tableName, columns) {
        // バージョンを上げて再オープン
        this.version++;
        this.db.close();

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                reject(new Error(`Failed to create table: ${request.error}`));
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // テーブルストアを作成
                if (!db.objectStoreNames.contains(tableName)) {
                    db.createObjectStore(tableName, { keyPath: '__id__', autoIncrement: true });
                }

                // メタデータストアが存在しない場合は作成
                if (!db.objectStoreNames.contains('__metadata__')) {
                    db.createObjectStore('__metadata__', { keyPath: 'key' });
                }
            };
        });
    }

    /**
     * テーブルを削除
     */
    async dropTable(tableName) {
        // バージョンを上げて再オープン
        this.version++;
        this.db.close();

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                reject(new Error(`Failed to drop table: ${request.error}`));
            };

            request.onsuccess = () => {
                this.db = request.result;
                
                // メタデータからスキーマ情報を削除
                this.deleteTableSchema(tableName).then(() => {
                    resolve();
                }).catch(reject);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // テーブルストアを削除
                if (db.objectStoreNames.contains(tableName)) {
                    db.deleteObjectStore(tableName);
                }
            };
        });
    }

    /**
     * テーブルのスキーマ情報を保存
     */
    async saveTableSchema(tableName, columns, primaryKey = null) {
        const transaction = this.db.transaction(['__metadata__'], 'readwrite');
        const store = transaction.objectStore('__metadata__');

        return new Promise((resolve, reject) => {
            const request = store.put({
                key: `schema_${tableName}`,
                tableName: tableName,
                columns: columns,
                primaryKey: primaryKey
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error(`Failed to save schema: ${request.error}`));
        });
    }

    /**
     * テーブルのスキーマ情報を削除
     */
    async deleteTableSchema(tableName) {
        const transaction = this.db.transaction(['__metadata__'], 'readwrite');
        const store = transaction.objectStore('__metadata__');

        return new Promise((resolve, reject) => {
            const request = store.delete(`schema_${tableName}`);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error(`Failed to delete schema: ${request.error}`));
        });
    }

    /**
     * テーブルのPRIMARY KEY情報を取得
     */
    async getTablePrimaryKey(tableName) {
        const transaction = this.db.transaction(['__metadata__'], 'readonly');
        const store = transaction.objectStore('__metadata__');

        return new Promise((resolve, reject) => {
            const request = store.get(`schema_${tableName}`);

            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.primaryKey : null);
            };
            request.onerror = () => reject(new Error(`Failed to get primary key: ${request.error}`));
        });
    }

    /**
     * テーブルのスキーマ情報を取得
     */
    async getTableSchema(tableName) {
        const transaction = this.db.transaction(['__metadata__'], 'readonly');
        const store = transaction.objectStore('__metadata__');

        return new Promise((resolve, reject) => {
            const request = store.get(`schema_${tableName}`);

            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result.columns);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(new Error(`Failed to get schema: ${request.error}`));
        });
    }

    /**
     * テーブルのスキーマ情報を更新
     */
    async updateTableSchema(tableName, schema) {
        const transaction = this.db.transaction(['__metadata__'], 'readwrite');
        const store = transaction.objectStore('__metadata__');

        return new Promise((resolve, reject) => {
            const request = store.put({
                key: `schema_${tableName}`,
                tableName: tableName,
                columns: schema.columns,
                primaryKey: schema.primaryKey || null
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error(`Failed to update schema: ${request.error}`));
        });
    }

    /**
     * テーブルが存在するかチェック
     */
    tableExists(tableName) {
        return this.db.objectStoreNames.contains(tableName);
    }

    /**
     * 全テーブル名の一覧を取得
     */
    getAllTableNames() {
        const tableNames = [];
        for (let i = 0; i < this.db.objectStoreNames.length; i++) {
            const name = this.db.objectStoreNames[i];
            // __metadata__ は除外
            if (name !== '__metadata__') {
                tableNames.push(name);
            }
        }
        return tableNames;
    }

    /**
     * テーブルの詳細情報を取得（スキーマとPRIMARY KEY情報を含む）
     */
    async getTableInfo(tableName) {
        const transaction = this.db.transaction(['__metadata__'], 'readonly');
        const store = transaction.objectStore('__metadata__');

        return new Promise((resolve, reject) => {
            const request = store.get(`schema_${tableName}`);

            request.onsuccess = () => {
                if (request.result) {
                    resolve({
                        tableName: request.result.tableName,
                        columns: request.result.columns,
                        primaryKey: request.result.primaryKey
                    });
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(new Error(`Failed to get table info: ${request.error}`));
        });
    }

    /**
     * データを挿入
     */
    async insert(tableName, data) {
        const transaction = this.db.transaction([tableName], 'readwrite');
        const store = transaction.objectStore(tableName);

        return new Promise((resolve, reject) => {
            const request = store.add(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error(`Failed to insert data: ${request.error}`));
        });
    }

    /**
     * 全データを取得
     */
    async getAll(tableName) {
        const transaction = this.db.transaction([tableName], 'readonly');
        const store = transaction.objectStore(tableName);

        return new Promise((resolve, reject) => {
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error(`Failed to get all data: ${request.error}`));
        });
    }

    /**
     * データを更新
     */
    async update(tableName, data) {
        const transaction = this.db.transaction([tableName], 'readwrite');
        const store = transaction.objectStore(tableName);

        return new Promise((resolve, reject) => {
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error(`Failed to update data: ${request.error}`));
        });
    }

    /**
     * データを削除
     */
    async delete(tableName, id) {
        const transaction = this.db.transaction([tableName], 'readwrite');
        const store = transaction.objectStore(tableName);

        return new Promise((resolve, reject) => {
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error(`Failed to delete data: ${request.error}`));
        });
    }

    /**
     * データベースを閉じる
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
/**
 * Tokenizer - SQL文をトークンに分割するクラス
 */
class Tokenizer {
    constructor(sql) {
        this.sql = sql.trim();
        this.position = 0;
        this.tokens = [];
    }

    /**
     * SQL文をトークン化
     */
    tokenize() {
        while (this.position < this.sql.length) {
            this.skipWhitespace();
            
            if (this.position >= this.sql.length) break;

            const char = this.sql[this.position];

            // 文字列リテラル
            if (char === "'" || char === '"') {
                this.tokenizeString(char);
            }
            // 数値
            else if (this.isDigit(char) || (char === '-' && this.isDigit(this.sql[this.position + 1]))) {
                this.tokenizeNumber();
            }
            // 識別子またはキーワード
            else if (this.isIdentifierStart(char)) {
                this.tokenizeIdentifier();
            }
            // 名前付きプレースホルダー (:name)
            else if (char === ':' && this.isIdentifierStart(this.sql[this.position + 1])) {
                this.tokenizeNamedPlaceholder();
            }
            // 位置指定プレースホルダー (?)
            else if (char === '?') {
                this.tokens.push({ type: 'PLACEHOLDER', value: '?' });
                this.position++;
            }
            // 演算子・記号
            else if (this.isOperator(char)) {
                this.tokenizeOperator();
            }
            // カンマ、括弧など
            else if (char === ',' || char === '(' || char === ')' || char === ';') {
                this.tokens.push({ type: 'SYMBOL', value: char });
                this.position++;
            }
            else {
                throw new Error(`Unexpected character: ${char} at position ${this.position}`);
            }
        }

        return this.tokens;
    }

    /**
     * 空白をスキップ
     */
    skipWhitespace() {
        while (this.position < this.sql.length && /\s/.test(this.sql[this.position])) {
            this.position++;
        }
    }

    /**
     * 文字列リテラルをトークン化
     */
    tokenizeString(quote) {
        this.position++; // 開始クォートをスキップ
        let value = '';

        while (this.position < this.sql.length) {
            const char = this.sql[this.position];

            if (char === quote) {
                // エスケープされたクォートかチェック
                if (this.sql[this.position + 1] === quote) {
                    value += quote;
                    this.position += 2;
                } else {
                    this.position++; // 終了クォートをスキップ
                    break;
                }
            } else {
                value += char;
                this.position++;
            }
        }

        this.tokens.push({ type: 'STRING', value: value });
    }

    /**
     * 数値をトークン化
     */
    tokenizeNumber() {
        let value = '';
        let hasDecimal = false;

        if (this.sql[this.position] === '-') {
            value += '-';
            this.position++;
        }

        while (this.position < this.sql.length) {
            const char = this.sql[this.position];

            if (this.isDigit(char)) {
                value += char;
                this.position++;
            } else if (char === '.' && !hasDecimal) {
                hasDecimal = true;
                value += char;
                this.position++;
            } else {
                break;
            }
        }

        this.tokens.push({ 
            type: 'NUMBER', 
            value: hasDecimal ? parseFloat(value) : parseInt(value, 10)
        });
    }

    /**
     * 識別子またはキーワードをトークン化
     */
    tokenizeIdentifier() {
        let value = '';

        while (this.position < this.sql.length) {
            const char = this.sql[this.position];

            if (this.isIdentifierPart(char)) {
                value += char;
                this.position++;
            } else {
                break;
            }
        }

        const upperValue = value.toUpperCase();
        const keywords = [
            'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES',
            'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'DROP',
            'AND', 'OR', 'NOT', 'NULL', 'LIKE', 'AS',
            'ORDER', 'BY', 'ASC', 'DESC', 'LIMIT', 'OFFSET',
            'GROUP', 'HAVING',
            'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
            'INTEGER', 'TEXT', 'REAL', 'BLOB', 'DATE', 'DATETIME',
            'PRIMARY', 'KEY', 'IF', 'EXISTS', 'UNIQUE', 'DEFAULT',
            'CURRENT_TIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIME',
            'ALTER', 'ADD', 'COLUMN'
        ];

        if (keywords.includes(upperValue)) {
            this.tokens.push({ type: 'KEYWORD', value: upperValue });
        } else {
            this.tokens.push({ type: 'IDENTIFIER', value: value });
        }
    }
    /**
     * 名前付きプレースホルダーをトークン化 (:name)
     */
    tokenizeNamedPlaceholder() {
        this.position++; // ':' をスキップ
        let name = '';

        while (this.position < this.sql.length && this.isIdentifierPart(this.sql[this.position])) {
            name += this.sql[this.position];
            this.position++;
        }

        this.tokens.push({ type: 'NAMED_PLACEHOLDER', value: name });
    }


    /**
     * 演算子をトークン化
     */
    tokenizeOperator() {
        const char = this.sql[this.position];
        const nextChar = this.sql[this.position + 1];

        // 2文字演算子
        if ((char === '!' || char === '<' || char === '>') && nextChar === '=') {
            this.tokens.push({ type: 'OPERATOR', value: char + nextChar });
            this.position += 2;
        }
        // 1文字演算子
        else if (char === '=' || char === '<' || char === '>' || char === '*') {
            this.tokens.push({ type: 'OPERATOR', value: char });
            this.position++;
        }
        else {
            throw new Error(`Unknown operator: ${char}`);
        }
    }

    /**
     * 文字かチェック（後方互換性のため残す）
     */
    isAlpha(char) {
        return /[a-zA-Z]/.test(char);
    }

    /**
     * 数字かチェック
     */
    isDigit(char) {
        return /[0-9]/.test(char);
    }

    /**
     * 英数字かチェック（後方互換性のため残す）
     */
    isAlphaNumeric(char) {
        return /[a-zA-Z0-9]/.test(char);
    }

    /**
     * 識別子の開始文字かチェック（Unicode対応）
     * 英字、アンダースコア、またはUnicode文字（日本語、中国語など）
     */
    isIdentifierStart(char) {
        if (!char) return false;
        // ASCII英字とアンダースコア
        if (/[a-zA-Z_]/.test(char)) return true;
        // Unicode文字（日本語、中国語、韓国語、アラビア語など）
        // 基本的に制御文字、空白、記号以外のすべてのUnicode文字を許可
        const code = char.charCodeAt(0);
        return code > 127; // ASCII範囲外のすべての文字を許可
    }

    /**
     * 識別子の一部として使える文字かチェック（Unicode対応）
     * 英数字、アンダースコア、またはUnicode文字
     */
    isIdentifierPart(char) {
        if (!char) return false;
        // ASCII英数字とアンダースコア
        if (/[a-zA-Z0-9_]/.test(char)) return true;
        // Unicode文字
        const code = char.charCodeAt(0);
        return code > 127; // ASCII範囲外のすべての文字を許可
    }

    /**
     * 演算子かチェック
     */
    isOperator(char) {
        return ['=', '!', '<', '>', '*'].includes(char);
    }
}
/**
 * Parser - トークンをパースしてSQL文の構造を解析するクラス
 */
class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.position = 0;
    }

    /**
     * 現在のトークンを取得
     */
    current() {
        return this.tokens[this.position];
    }

    /**
     * 次のトークンに進む
     */
    advance() {
        this.position++;
    }

    /**
     * 特定の型のトークンを期待
     */
    expect(type, value = null) {
        const token = this.current();
        if (!token) {
            throw new Error(`Expected ${type}${value ? ` '${value}'` : ''} but reached end of tokens`);
        }
        if (token.type !== type) {
            throw new Error(`Expected ${type} but got ${token.type}`);
        }
        if (value !== null && token.value !== value) {
            throw new Error(`Expected '${value}' but got '${token.value}'`);
        }
        this.advance();
        return token;
    }

    /**
     * SQL文をパース
     */
    parse() {
        if (!this.current()) {
            throw new Error('Empty SQL statement');
        }

        const firstToken = this.current();
        if (firstToken.type !== 'KEYWORD') {
            throw new Error(`Expected SQL keyword but got ${firstToken.type}`);
        }

        switch (firstToken.value) {
            case 'CREATE':
                return this.parseCreate();
            case 'DROP':
                return this.parseDrop();
            case 'ALTER':
                return this.parseAlter();
            case 'INSERT':
                return this.parseInsert();
            case 'SELECT':
                return this.parseSelect();
            case 'UPDATE':
                return this.parseUpdate();
            case 'DELETE':
                return this.parseDelete();
            default:
                throw new Error(`Unsupported SQL statement: ${firstToken.value}`);
        }
    }

    /**
     * CREATE TABLE文をパース
     */
    parseCreate() {
        this.expect('KEYWORD', 'CREATE');
        this.expect('KEYWORD', 'TABLE');
        
        // IF NOT EXISTS のチェック
        let ifNotExists = false;
        if (this.current() && this.current().type === 'KEYWORD' && this.current().value === 'IF') {
            this.advance();
            this.expect('KEYWORD', 'NOT');
            this.expect('KEYWORD', 'EXISTS');
            ifNotExists = true;
        }
        
        const tableName = this.expect('IDENTIFIER').value;
        
        this.expect('SYMBOL', '(');
        
        const columns = [];
        let primaryKey = null;
        
        while (this.current() && this.current().value !== ')') {
            const columnName = this.expect('IDENTIFIER').value;
            const columnType = this.expect('KEYWORD').value;
            
            const column = {
                name: columnName,
                type: columnType,
                primaryKey: false,
                notNull: false,
                unique: false,
                defaultValue: null
            };
            
            // 制約のチェック（PRIMARY KEY, NOT NULL, UNIQUE, DEFAULT）
            while (this.current() && this.current().type === 'KEYWORD') {
                const keyword = this.current().value;
                
                if (keyword === 'PRIMARY') {
                    this.advance();
                    this.expect('KEYWORD', 'KEY');
                    column.primaryKey = true;
                    primaryKey = columnName;
                } else if (keyword === 'NOT') {
                    this.advance();
                    this.expect('KEYWORD', 'NULL');
                    column.notNull = true;
                } else if (keyword === 'UNIQUE') {
                    this.advance();
                    column.unique = true;
                } else if (keyword === 'DEFAULT') {
                    this.advance();
                    // DEFAULT値の解析
                    const token = this.current();
                    if (token.type === 'STRING') {
                        column.defaultValue = { type: 'STRING', value: token.value };
                        this.advance();
                    } else if (token.type === 'NUMBER') {
                        column.defaultValue = { type: 'NUMBER', value: token.value };
                        this.advance();
                    } else if (token.type === 'KEYWORD') {
                        if (token.value === 'NULL') {
                            column.defaultValue = { type: 'NULL', value: null };
                            this.advance();
                        } else if (token.value === 'CURRENT_TIMESTAMP') {
                            column.defaultValue = { type: 'FUNCTION', value: 'CURRENT_TIMESTAMP' };
                            this.advance();
                        } else if (token.value === 'CURRENT_DATE') {
                            column.defaultValue = { type: 'FUNCTION', value: 'CURRENT_DATE' };
                            this.advance();
                        } else if (token.value === 'CURRENT_TIME') {
                            column.defaultValue = { type: 'FUNCTION', value: 'CURRENT_TIME' };
                            this.advance();
                        } else {
                            throw new Error(`Unexpected DEFAULT value: ${token.value}`);
                        }
                    } else {
                        throw new Error(`Unexpected DEFAULT value type: ${token.type}`);
                    }
                } else {
                    break;
                }
            }
            
            columns.push(column);
            
            // カンマがあれば次のカラムへ
            if (this.current() && this.current().value === ',') {
                this.advance();
            }
        }
        
        this.expect('SYMBOL', ')');
        
        return {
            type: 'CREATE_TABLE',
            tableName: tableName,
            columns: columns,
            primaryKey: primaryKey,
            ifNotExists: ifNotExists
        };
    }

    /**
     * INSERT文をパース（バルクインサート対応）
     */
    parseInsert() {
        this.expect('KEYWORD', 'INSERT');
        this.expect('KEYWORD', 'INTO');
        
        const tableName = this.expect('IDENTIFIER').value;
        
        // カラムリスト
        this.expect('SYMBOL', '(');
        const columns = [];
        while (this.current() && this.current().value !== ')') {
            columns.push(this.expect('IDENTIFIER').value);
            if (this.current() && this.current().value === ',') {
                this.advance();
            }
        }
        this.expect('SYMBOL', ')');
        
        // VALUES
        this.expect('KEYWORD', 'VALUES');
        
        // 複数の VALUES 句をパース
        const valuesList = [];
        
        while (true) {
            this.expect('SYMBOL', '(');
            
            const values = [];
            while (this.current() && this.current().value !== ')') {
                const token = this.current();
                if (token.type === 'STRING' || token.type === 'NUMBER') {
                    values.push(token.value);
                    this.advance();
                } else if (token.type === 'KEYWORD' && token.value === 'NULL') {
                    values.push(null);
                    this.advance();
                } else if (token.type === 'PLACEHOLDER') {
                    values.push({ type: 'PLACEHOLDER', index: '?' });
                    this.advance();
                } else if (token.type === 'NAMED_PLACEHOLDER') {
                    values.push({ type: 'NAMED_PLACEHOLDER', name: token.value });
                    this.advance();
                } else {
                    throw new Error(`Unexpected token in VALUES: ${token.type}`);
                }
                
                if (this.current() && this.current().value === ',') {
                    this.advance();
                }
            }
            this.expect('SYMBOL', ')');
            
            valuesList.push(values);
            
            // 次の VALUES 句があるかチェック
            if (this.current() && this.current().value === ',') {
                this.advance();
            } else {
                break;
            }
        }
        
        return {
            type: 'INSERT',
            tableName: tableName,
            columns: columns,
            valuesList: valuesList  // 複数の値リスト
        };
    }

    /**
     * SELECT文をパース
     */
    parseSelect() {
        this.expect('KEYWORD', 'SELECT');
        
        // カラムリスト（集約関数対応、AS句対応）
        const columns = [];
        while (this.current() && this.current().value !== 'FROM') {
            let column;
            let alias = null;
            
            if (this.current().type === 'OPERATOR' && this.current().value === '*') {
                column = '*';
                this.advance();
            } else if (this.current().type === 'KEYWORD' &&
                       ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(this.current().value)) {
                // 集約関数
                const funcName = this.current().value;
                this.advance();
                this.expect('SYMBOL', '(');
                
                let argument;
                if (this.current().type === 'OPERATOR' && this.current().value === '*') {
                    argument = '*';
                    this.advance();
                } else if (this.current().type === 'IDENTIFIER') {
                    argument = this.current().value;
                    this.advance();
                } else {
                    throw new Error(`Invalid argument for ${funcName}`);
                }
                
                this.expect('SYMBOL', ')');
                
                column = {
                    type: 'AGGREGATE',
                    function: funcName,
                    argument: argument
                };
            } else if (this.current().type === 'IDENTIFIER') {
                column = this.current().value;
                this.advance();
            }
            
            // AS句のチェック
            if (this.current() && this.current().type === 'KEYWORD' && this.current().value === 'AS') {
                this.advance();
                // エイリアスはIDENTIFIERまたはKEYWORDを許可（予約語もエイリアスとして使用可能）
                const token = this.current();
                if (token && (token.type === 'IDENTIFIER' || token.type === 'KEYWORD')) {
                    alias = token.value.toLowerCase(); // エイリアスは小文字に統一
                    this.advance();
                } else {
                    throw new Error('Expected alias name after AS');
                }
            }
            
            // カラムとエイリアスを格納
            if (alias) {
                if (typeof column === 'object' && column.type === 'AGGREGATE') {
                    column.alias = alias;
                    columns.push(column);
                } else {
                    columns.push({
                        type: 'COLUMN',
                        name: column,
                        alias: alias
                    });
                }
            } else {
                columns.push(column);
            }
            
            if (this.current() && this.current().value === ',') {
                this.advance();
            }
        }
        
        this.expect('KEYWORD', 'FROM');
        const tableName = this.expect('IDENTIFIER').value;
        
        // WHERE句（オプション）
        let whereCondition = null;
        if (this.current() && this.current().value === 'WHERE') {
            this.advance();
            whereCondition = this.parseWhereCondition();
        }
        
        // GROUP BY句（オプション）
        let groupBy = null;
        if (this.current() && this.current().value === 'GROUP') {
            this.advance();
            this.expect('KEYWORD', 'BY');
            groupBy = this.parseGroupBy();
        }
        
        // HAVING句（オプション）
        let having = null;
        if (this.current() && this.current().value === 'HAVING') {
            this.advance();
            having = this.parseHaving();
        }
        
        // ORDER BY句（オプション）
        let orderBy = null;
        if (this.current() && this.current().value === 'ORDER') {
            this.advance();
            this.expect('KEYWORD', 'BY');
            orderBy = this.parseOrderBy();
        }
        
        // LIMIT句（オプション）
        let limit = null;
        let offset = null;
        if (this.current() && this.current().value === 'LIMIT') {
            this.advance();
            limit = parseInt(this.expect('NUMBER').value, 10);
            
            // OFFSET句（オプション）
            if (this.current() && this.current().value === 'OFFSET') {
                this.advance();
                offset = parseInt(this.expect('NUMBER').value, 10);
            }
        }
        
        return {
            type: 'SELECT',
            columns: columns,
            tableName: tableName,
            where: whereCondition,
            groupBy: groupBy,
            having: having,
            orderBy: orderBy,
            limit: limit,
            offset: offset
        };
    }

    /**
     * UPDATE文をパース
     */
    parseUpdate() {
        this.expect('KEYWORD', 'UPDATE');
        const tableName = this.expect('IDENTIFIER').value;
        this.expect('KEYWORD', 'SET');
        
        // SET句
        const updates = {};
        while (this.current() && this.current().value !== 'WHERE') {
            const columnName = this.expect('IDENTIFIER').value;
            this.expect('OPERATOR', '=');
            
            const token = this.current();
            let value;
            if (token.type === 'STRING' || token.type === 'NUMBER') {
                value = token.value;
                this.advance();
            } else if (token.type === 'KEYWORD' && token.value === 'NULL') {
                value = null;
                this.advance();
            } else if (token.type === 'PLACEHOLDER') {
                value = { type: 'PLACEHOLDER', index: '?' };
                this.advance();
            } else if (token.type === 'NAMED_PLACEHOLDER') {
                value = { type: 'NAMED_PLACEHOLDER', name: token.value };
                this.advance();
            } else {
                throw new Error(`Unexpected token in SET: ${token.type}`);
            }
            
            updates[columnName] = value;
            
            if (this.current() && this.current().value === ',') {
                this.advance();
            }
        }
        
        // WHERE句（オプション）
        let whereCondition = null;
        if (this.current() && this.current().value === 'WHERE') {
            this.advance();
            whereCondition = this.parseWhereCondition();
        }
        
        return {
            type: 'UPDATE',
            tableName: tableName,
            updates: updates,
            where: whereCondition
        };
    }

    /**
     * DELETE文をパース
     */
    parseDelete() {
        this.expect('KEYWORD', 'DELETE');
        this.expect('KEYWORD', 'FROM');
        const tableName = this.expect('IDENTIFIER').value;
        
        // WHERE句（オプション）
        let whereCondition = null;
        if (this.current() && this.current().value === 'WHERE') {
            this.advance();
            whereCondition = this.parseWhereCondition();
        }
        
        return {
            type: 'DELETE',
            tableName: tableName,
            where: whereCondition
        };
    }

    /**
     * DROP TABLE文をパース
     * DROP TABLE [IF EXISTS] table_name
     */
    parseDrop() {
        this.expect('KEYWORD', 'DROP');
        this.expect('KEYWORD', 'TABLE');
        
        // IF EXISTS のチェック
        let ifExists = false;
        if (this.current() && this.current().type === 'KEYWORD' && this.current().value === 'IF') {
            this.advance(); // IF
            this.expect('KEYWORD', 'EXISTS');
            ifExists = true;
        }
        
        const tableName = this.expect('IDENTIFIER').value;
        
        return {
            type: 'DROP_TABLE',
            tableName: tableName,
            ifExists: ifExists
        };
    }

    /**
     * ORDER BY句をパース
     */
    parseOrderBy() {
        const orderByList = [];
        
        while (true) {
            let columnName;
            
            // 集約関数の場合
            if (this.current().type === 'KEYWORD' &&
                ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(this.current().value)) {
                const funcName = this.current().value;
                this.advance();
                this.expect('SYMBOL', '(');
                
                let argument;
                if (this.current().type === 'OPERATOR' && this.current().value === '*') {
                    argument = '*';
                    this.advance();
                } else if (this.current().type === 'IDENTIFIER') {
                    argument = this.current().value;
                    this.advance();
                } else {
                    throw new Error(`Invalid argument for ${funcName} in ORDER BY`);
                }
                
                this.expect('SYMBOL', ')');
                columnName = `${funcName}(${argument})`;
            } else {
                // 通常のカラム名
                columnName = this.expect('IDENTIFIER').value;
            }
            
            let direction = 'ASC'; // デフォルトは昇順
            
            // ASC または DESC の指定
            if (this.current() && (this.current().value === 'ASC' || this.current().value === 'DESC')) {
                direction = this.current().value;
                this.advance();
            }
            
            orderByList.push({
                column: columnName,
                direction: direction
            });
            
            // 次のカラムがあるかチェック
            if (this.current() && this.current().value === ',') {
                this.advance();
            } else {
                break;
            }
        }
        
        return orderByList;
    }

    /**
     * GROUP BY句をパース
     */
    parseGroupBy() {
        const groupByList = [];
        
        while (true) {
            const columnName = this.expect('IDENTIFIER').value;
            groupByList.push(columnName);
            
            // 次のカラムがあるかチェック
            if (this.current() && this.current().value === ',') {
                this.advance();
            } else {
                break;
            }
        }
        
        return groupByList;
    }

    /**
     * HAVING句をパース
     */
    parseHaving() {
        // HAVING句は集約関数を含む条件式
        // 例: HAVING COUNT(*) > 10
        // 例: HAVING AVG(price) > 100
        
        const condition = {};
        
        // 集約関数
        if (this.current().type === 'KEYWORD' && 
            ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(this.current().value)) {
            const funcName = this.current().value;
            this.advance();
            this.expect('SYMBOL', '(');
            
            let argument;
            if (this.current().type === 'OPERATOR' && this.current().value === '*') {
                argument = '*';
                this.advance();
            } else if (this.current().type === 'IDENTIFIER') {
                argument = this.current().value;
                this.advance();
            } else {
                throw new Error(`Invalid argument for ${funcName} in HAVING`);
            }
            
            this.expect('SYMBOL', ')');
            
            condition.function = funcName;
            condition.argument = argument;
        } else {
            throw new Error('HAVING clause requires an aggregate function');
        }
        
        // 比較演算子
        if (this.current() && this.current().type === 'OPERATOR') {
            condition.operator = this.current().value;
            this.advance();
        } else {
            throw new Error('HAVING clause requires a comparison operator');
        }
        
        // 値
        if (this.current() && this.current().type === 'NUMBER') {
            condition.value = parseFloat(this.current().value);
            this.advance();
        } else {
            throw new Error('HAVING clause requires a numeric value');
        }
        
        return condition;
    }

    /**
     * WHERE条件をパース
     */
    parseWhereCondition() {
        return this.parseOrCondition();
    }

    /**
     * OR条件をパース
     */
    parseOrCondition() {
        let left = this.parseAndCondition();
        
        while (this.current() && this.current().value === 'OR') {
            this.advance();
            const right = this.parseAndCondition();
            left = {
                type: 'OR',
                left: left,
                right: right
            };
        }
        
        return left;
    }

    /**
     * AND条件をパース
     */
    parseAndCondition() {
        let left = this.parseComparison();
        
        while (this.current() && this.current().value === 'AND') {
            this.advance();
            const right = this.parseComparison();
            left = {
                type: 'AND',
                left: left,
                right: right
            };
        }
        
        return left;
    }

    /**
     * 比較条件をパース
     */
    parseComparison() {
        const columnName = this.expect('IDENTIFIER').value;
        
        // LIKE 演算子のチェック
        if (this.current() && this.current().type === 'KEYWORD' && this.current().value === 'LIKE') {
            this.advance(); // LIKE をスキップ
            
            const token = this.current();
            let pattern;
            if (token.type === 'STRING') {
                pattern = token.value;
                this.advance();
            } else if (token.type === 'PLACEHOLDER') {
                pattern = { type: 'PLACEHOLDER', index: '?' };
                this.advance();
            } else if (token.type === 'NAMED_PLACEHOLDER') {
                pattern = { type: 'NAMED_PLACEHOLDER', name: token.value };
                this.advance();
            } else {
                throw new Error(`Expected string pattern or placeholder after LIKE`);
            }
            
            return {
                type: 'LIKE',
                left: columnName,
                pattern: pattern
            };
        }
        
        // 通常の比較演算子
        const operator = this.expect('OPERATOR').value;
        
        const token = this.current();
        let value;
        if (token.type === 'STRING' || token.type === 'NUMBER') {
            value = token.value;
            this.advance();
        } else if (token.type === 'KEYWORD' && token.value === 'NULL') {
            value = null;
            this.advance();
        } else if (token.type === 'PLACEHOLDER') {
            value = { type: 'PLACEHOLDER', index: '?' };
            this.advance();
        } else if (token.type === 'NAMED_PLACEHOLDER') {
            value = { type: 'NAMED_PLACEHOLDER', name: token.value };
            this.advance();
        } else {
            throw new Error(`Unexpected token in comparison: ${token.type}`);
        }
        
        return {
            type: 'COMPARISON',
            left: columnName,
            operator: operator,
            right: value
        };
    }

    /**
     * ALTER TABLE文をパース
     */
    parseAlter() {
        this.expect('KEYWORD', 'ALTER');
        this.expect('KEYWORD', 'TABLE');
        
        const tableName = this.expect('IDENTIFIER').value;
        
        // ADD または DROP をチェック
        const actionToken = this.expect('KEYWORD');
        const action = actionToken.value;
        
        if (action === 'ADD') {
            // COLUMN キーワードはオプション
            if (this.current() && this.current().type === 'KEYWORD' && this.current().value === 'COLUMN') {
                this.advance();
            }
            
            // カラム定義の解析（CREATE TABLEと同じロジック）
            const columnName = this.expect('IDENTIFIER').value;
            const columnType = this.expect('KEYWORD').value;
            
            const column = {
                name: columnName,
                type: columnType,
                primaryKey: false,
                notNull: false,
                unique: false,
                defaultValue: null
            };
            
            // 制約のチェック（PRIMARY KEY, NOT NULL, UNIQUE, DEFAULT）
            while (this.current() && this.current().type === 'KEYWORD') {
                const keyword = this.current().value;
                
                if (keyword === 'PRIMARY') {
                    this.advance();
                    this.expect('KEYWORD', 'KEY');
                    column.primaryKey = true;
                } else if (keyword === 'NOT') {
                    this.advance();
                    this.expect('KEYWORD', 'NULL');
                    column.notNull = true;
                } else if (keyword === 'UNIQUE') {
                    this.advance();
                    column.unique = true;
                } else if (keyword === 'DEFAULT') {
                    this.advance();
                    // DEFAULT値の解析
                    const token = this.current();
                    if (token.type === 'STRING') {
                        column.defaultValue = { type: 'STRING', value: token.value };
                        this.advance();
                    } else if (token.type === 'NUMBER') {
                        column.defaultValue = { type: 'NUMBER', value: token.value };
                        this.advance();
                    } else if (token.type === 'KEYWORD') {
                        if (token.value === 'NULL') {
                            column.defaultValue = { type: 'NULL', value: null };
                            this.advance();
                        } else if (token.value === 'CURRENT_TIMESTAMP') {
                            column.defaultValue = { type: 'FUNCTION', value: 'CURRENT_TIMESTAMP' };
                            this.advance();
                        } else if (token.value === 'CURRENT_DATE') {
                            column.defaultValue = { type: 'FUNCTION', value: 'CURRENT_DATE' };
                            this.advance();
                        } else if (token.value === 'CURRENT_TIME') {
                            column.defaultValue = { type: 'FUNCTION', value: 'CURRENT_TIME' };
                            this.advance();
                        } else {
                            throw new Error(`Unexpected DEFAULT value: ${token.value}`);
                        }
                    } else {
                        throw new Error(`Unexpected DEFAULT value type: ${token.type}`);
                    }
                } else {
                    break;
                }
            }
            
            return {
                type: 'ALTER_TABLE',
                action: 'ADD_COLUMN',
                tableName: tableName,
                column: column
            };
            
        } else if (action === 'DROP') {
            // COLUMN キーワードはオプション
            if (this.current() && this.current().type === 'KEYWORD' && this.current().value === 'COLUMN') {
                this.advance();
            }
            
            const columnName = this.expect('IDENTIFIER').value;
            
            return {
                type: 'ALTER_TABLE',
                action: 'DROP_COLUMN',
                tableName: tableName,
                columnName: columnName
            };
            
        } else {
            throw new Error(`Unsupported ALTER TABLE action: ${action}`);
        }
    }
}
/**
 * Executor - パースされたSQL文を実行するクラス
 */
class Executor {
    constructor(dbManager) {
        this.dbManager = dbManager;
    }

    /**
     * SQL文を実行
     * @param {Object} statement - パース済みのSQL文
     * @param {Array|Object} params - プレースホルダーのパラメータ
     */
    async execute(statement, params = null) {
        // パラメータバインディング
        if (params) {
            statement = this.bindParameters(statement, params);
        }

        switch (statement.type) {
            case 'CREATE_TABLE':
                return await this.executeCreateTable(statement);
            case 'DROP_TABLE':
                return await this.executeDropTable(statement);
            case 'ALTER_TABLE':
                return await this.executeAlterTable(statement);
            case 'INSERT':
                return await this.executeInsert(statement);
            case 'SELECT':
                return await this.executeSelect(statement);
            case 'UPDATE':
                return await this.executeUpdate(statement);
            case 'DELETE':
                return await this.executeDelete(statement);
            default:
                throw new Error(`Unsupported statement type: ${statement.type}`);
        }
    }

    /**
     * プレースホルダーにパラメータをバインド
     */
    bindParameters(statement, params) {
        const isPositional = Array.isArray(params);
        let positionalIndex = 0;

        const bindValue = (value) => {
            if (value && typeof value === 'object') {
                if (value.type === 'PLACEHOLDER') {
                    if (!isPositional) {
                        throw new Error('Positional placeholder (?) requires array parameters');
                    }
                    if (positionalIndex >= params.length) {
                        throw new Error(`Not enough parameters provided. Expected at least ${positionalIndex + 1}`);
                    }
                    return params[positionalIndex++];
                } else if (value.type === 'NAMED_PLACEHOLDER') {
                    if (isPositional) {
                        throw new Error(`Named placeholder (:${value.name}) requires object parameters`);
                    }
                    if (!(value.name in params)) {
                        throw new Error(`Missing parameter: ${value.name}`);
                    }
                    return params[value.name];
                }
            }
            return value;
        };

        // ステートメントのディープコピーを作成（バイナリデータを保持）
        const deepCopy = (obj) => {
            if (obj === null || typeof obj !== 'object') return obj;
            if (obj instanceof Date) return new Date(obj);
            if (obj instanceof ArrayBuffer) return obj.slice(0);
            if (ArrayBuffer.isView(obj)) return obj.slice();
            if (obj instanceof Blob) return obj;
            if (Array.isArray(obj)) return obj.map(item => deepCopy(item));
            
            const copy = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    copy[key] = deepCopy(obj[key]);
                }
            }
            return copy;
        };

        const boundStatement = deepCopy(statement);

        // INSERT文のバインディング
        if (boundStatement.type === 'INSERT') {
            boundStatement.valuesList = boundStatement.valuesList.map(values =>
                values.map(v => bindValue(v))
            );
        }

        // UPDATE文のバインディング
        if (boundStatement.type === 'UPDATE') {
            for (const key in boundStatement.updates) {
                boundStatement.updates[key] = bindValue(boundStatement.updates[key]);
            }
        }

        // WHERE句のバインディング
        if (boundStatement.where) {
            const bindWhereCondition = (condition) => {
                if (!condition) return condition;

                if (condition.type === 'COMPARISON') {
                    condition.right = bindValue(condition.right);
                } else if (condition.type === 'LIKE') {
                    condition.pattern = bindValue(condition.pattern);
                } else if (condition.type === 'AND' || condition.type === 'OR') {
                    condition.left = bindWhereCondition(condition.left);
                    condition.right = bindWhereCondition(condition.right);
                }
                return condition;
            };

            boundStatement.where = bindWhereCondition(boundStatement.where);
        }

        return boundStatement;
    }

    /**
     * CREATE TABLE文を実行
     */
    async executeCreateTable(statement) {
        const { tableName, columns, primaryKey, ifNotExists } = statement;

        // テーブルが既に存在するかチェック
        if (this.dbManager.tableExists(tableName)) {
            // IF NOT EXISTS が指定されている場合はエラーを出さずに成功を返す
            if (ifNotExists) {
                return {
                    type: 'CREATE_TABLE',
                    success: true,
                    message: `Table '${tableName}' already exists (skipped)`
                };
            }
            throw new Error(`Table '${tableName}' already exists`);
        }

        // テーブルを作成
        await this.dbManager.createTable(tableName, columns);

        // スキーマ情報を保存（PRIMARY KEY情報を含む）
        await this.dbManager.saveTableSchema(tableName, columns, primaryKey);

        return {
            type: 'CREATE_TABLE',
            success: true,
            message: `Table '${tableName}' created successfully`
        };
    }

    /**
     * DROP TABLE文を実行
     */
    async executeDropTable(statement) {
        const { tableName, ifExists } = statement;

        // テーブルが存在するかチェック
        if (!this.dbManager.tableExists(tableName)) {
            // IF EXISTS が指定されている場合はエラーを出さずに成功を返す
            if (ifExists) {
                return {
                    type: 'DROP_TABLE',
                    success: true,
                    message: `Table '${tableName}' does not exist (skipped)`
                };
            }
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // テーブルを削除
        await this.dbManager.dropTable(tableName);

        return {
            type: 'DROP_TABLE',
            success: true,
            message: `Table '${tableName}' dropped successfully`
        };
    }

    /**
     * INSERT文を実行（バルクインサート対応）
     */
    async executeInsert(statement) {
        const { tableName, columns, valuesList } = statement;

        // テーブルの存在チェック
        if (!this.dbManager.tableExists(tableName)) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // スキーマを取得
        const schema = await this.dbManager.getTableSchema(tableName);
        if (!schema) {
            throw new Error(`Schema for table '${tableName}' not found`);
        }

        // PRIMARY KEY情報を取得
        const primaryKey = await this.dbManager.getTablePrimaryKey(tableName);

        // 複数行を挿入
        const insertedIds = [];
        for (const values of valuesList) {
            // データオブジェクトを作成
            const data = {};
            for (let i = 0; i < columns.length; i++) {
                const columnName = columns[i];
                const value = values[i];

                // カラムがスキーマに存在するかチェック
                const columnSchema = schema.find(col => col.name === columnName);
                if (!columnSchema) {
                    throw new Error(`Column '${columnName}' does not exist in table '${tableName}'`);
                }

                // PRIMARY KEY制約のチェック
                if (primaryKey && columnName === primaryKey) {
                    // NULL値の禁止
                    if (value === null || value === undefined) {
                        throw new Error(`PRIMARY KEY column '${columnName}' cannot be NULL`);
                    }
                    
                    // 重複チェック
                    const existingRows = await this.dbManager.getAll(tableName);
                    const duplicate = existingRows.find(row => row[columnName] === value);
                    if (duplicate) {
                        throw new Error(`PRIMARY KEY constraint violation: duplicate value '${value}' for column '${columnName}'`);
                    }
                }

                // NOT NULL制約のチェック
                if (columnSchema.notNull && (value === null || value === undefined)) {
                    throw new Error(`NOT NULL constraint violation: column '${columnName}' cannot be NULL`);
                }

                // UNIQUE制約のチェック
                if (columnSchema.unique && value !== null && value !== undefined) {
                    const existingRows = await this.dbManager.getAll(tableName);
                    const duplicate = existingRows.find(row => row[columnName] === value);
                    if (duplicate) {
                        throw new Error(`UNIQUE constraint violation: duplicate value '${value}' for column '${columnName}'`);
                    }
                }

                // データ型の検証と変換
                if (value !== null) {
                    if (!validateDataType(value, columnSchema.type)) {
                        throw new Error(`Invalid data type for column '${columnName}': expected ${columnSchema.type}`);
                    }
                    // BLOB 型の場合は非同期変換が必要な場合がある
                    if (columnSchema.type.toUpperCase() === 'BLOB') {
                        data[columnName] = await convertToArrayBuffer(value);
                    } else {
                        data[columnName] = convertToDataType(value, columnSchema.type);
                    }
                } else {
                    data[columnName] = null;
                }
            }

            // 指定されていないカラムにデフォルト値を適用
            for (const columnSchema of schema) {
                const columnName = columnSchema.name;
                
                // カラムが指定されていない場合
                if (!columns.includes(columnName)) {
                    if (columnSchema.defaultValue) {
                        // デフォルト値を適用
                        const defaultVal = this.evaluateDefaultValue(columnSchema.defaultValue);
                        
                        // データ型の検証と変換
                        if (defaultVal !== null) {
                            if (!validateDataType(defaultVal, columnSchema.type)) {
                                throw new Error(`Invalid default value type for column '${columnName}': expected ${columnSchema.type}`);
                            }
                            data[columnName] = convertToDataType(defaultVal, columnSchema.type);
                        } else {
                            data[columnName] = null;
                        }
                    } else if (columnSchema.notNull) {
                        // NOT NULL制約があるのにデフォルト値もない場合はエラー
                        throw new Error(`NOT NULL constraint violation: column '${columnName}' requires a value`);
                    } else {
                        // デフォルト値がない場合はNULL
                        data[columnName] = null;
                    }
                }
            }

            // データを挿入
            const id = await this.dbManager.insert(tableName, data);
            insertedIds.push(id);
        }

        return {
            type: 'INSERT',
            success: true,
            insertedIds: insertedIds,
            rowCount: insertedIds.length
        };
    }

    /**
     * SELECT文を実行
     */
    async executeSelect(statement) {
        const { tableName, columns, where, groupBy, having, orderBy, limit, offset } = statement;

        // テーブルの存在チェック
        if (!this.dbManager.tableExists(tableName)) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // 全データを取得
        let rows = await this.dbManager.getAll(tableName);

        // WHERE句でフィルタリング
        if (where) {
            rows = rows.filter(row => evaluateWhereCondition(row, where));
        }

        // GROUP BY句の処理
        if (groupBy && groupBy.length > 0) {
            return this.executeGroupBy(rows, columns, groupBy, having, orderBy, limit, offset);
        }

        // 集約関数のチェック（GROUP BY なし）
        const hasAggregates = columns.some(col => typeof col === 'object' && col.type === 'AGGREGATE');

        if (hasAggregates) {
            // 集約関数の処理（GROUP BY なし）
            const result = {};
            for (const col of columns) {
                if (typeof col === 'object' && col.type === 'AGGREGATE') {
                    const { function: funcName, argument, alias } = col;
                    const columnName = alias || `${funcName}(${argument})`;
                    result[columnName] = this.calculateAggregate(funcName, argument, rows);
                }
            }
            return {
                type: 'SELECT',
                success: true,
                rows: [result],
                rowCount: 1
            };
        }

        // ORDER BY句でソート
        if (orderBy && orderBy.length > 0) {
            rows.sort((a, b) => {
                for (const order of orderBy) {
                    const { column, direction } = order;
                    const aVal = a[column];
                    const bVal = b[column];
                    
                    let comparison = 0;
                    if (aVal < bVal) comparison = -1;
                    else if (aVal > bVal) comparison = 1;
                    
                    if (comparison !== 0) {
                        return direction === 'DESC' ? -comparison : comparison;
                    }
                }
                return 0;
            });
        }

        // OFFSET と LIMIT を適用
        if (offset !== null && offset !== undefined) {
            rows = rows.slice(offset);
        }
        if (limit !== null && limit !== undefined) {
            rows = rows.slice(0, limit);
        }

        // カラムの選択（エイリアス対応）
        if (!columns.includes('*')) {
            rows = rows.map(row => {
                const selectedRow = {};
                for (const col of columns) {
                    if (typeof col === 'object' && col.type === 'COLUMN') {
                        // エイリアス付きカラム
                        const { name, alias } = col;
                        if (row.hasOwnProperty(name)) {
                            selectedRow[alias] = row[name];
                        }
                    } else if (typeof col === 'string' && row.hasOwnProperty(col)) {
                        // 通常のカラム
                        selectedRow[col] = row[col];
                    }
                }
                return selectedRow;
            });
        }

        return {
            type: 'SELECT',
            success: true,
            rows: rows,
            rowCount: rows.length
        };
    }

    /**
     * 集約関数を計算
     */
    calculateAggregate(funcName, argument, rows) {
        switch (funcName) {
            case 'COUNT':
                if (argument === '*') {
                    return rows.length;
                } else {
                    // NULL を除いてカウント
                    return rows.filter(row => row[argument] !== null && row[argument] !== undefined).length;
                }
            
            case 'SUM':
                return rows.reduce((sum, row) => {
                    const value = row[argument];
                    if (value !== null && value !== undefined && typeof value === 'number') {
                        return sum + value;
                    }
                    return sum;
                }, 0);
            
            case 'AVG':
                const values = rows.filter(row => {
                    const value = row[argument];
                    return value !== null && value !== undefined && typeof value === 'number';
                }).map(row => row[argument]);
                
                if (values.length === 0) return null;
                return values.reduce((sum, val) => sum + val, 0) / values.length;
            
            case 'MIN':
                const minValues = rows.filter(row => {
                    const value = row[argument];
                    return value !== null && value !== undefined;
                }).map(row => row[argument]);
                
                if (minValues.length === 0) return null;
                return Math.min(...minValues);
            
            case 'MAX':
                const maxValues = rows.filter(row => {
                    const value = row[argument];
                    return value !== null && value !== undefined;
                }).map(row => row[argument]);
                
                if (maxValues.length === 0) return null;
                return Math.max(...maxValues);
            
            default:
                throw new Error(`Unsupported aggregate function: ${funcName}`);
        }
    }

    /**
     * GROUP BY句を実行
     */
    executeGroupBy(rows, columns, groupBy, having, orderBy, limit, offset) {
        // グループ化
        const groups = {};
        
        for (const row of rows) {
            // グループキーを生成
            const groupKey = groupBy.map(col => row[col]).join('|');
            
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(row);
        }
        
        // 各グループに対して集約関数を計算
        const results = [];
        for (const groupKey in groups) {
            const groupRows = groups[groupKey];
            const result = {};
            
            // グループ化カラムの値を設定
            for (let i = 0; i < groupBy.length; i++) {
                const colName = groupBy[i];
                result[colName] = groupRows[0][colName];
            }
            
            // 集約関数を計算（エイリアス対応）
            for (const col of columns) {
                if (typeof col === 'object' && col.type === 'AGGREGATE') {
                    const { function: funcName, argument, alias } = col;
                    const columnName = alias || `${funcName}(${argument})`;
                    result[columnName] = this.calculateAggregate(funcName, argument, groupRows);
                } else if (typeof col === 'object' && col.type === 'COLUMN') {
                    // エイリアス付きカラム
                    const { name, alias } = col;
                    if (!groupBy.includes(name)) {
                        result[alias] = groupRows[0][name];
                    }
                } else if (typeof col === 'string' && !groupBy.includes(col)) {
                    // GROUP BY に含まれないカラムは無視（または最初の値を使用）
                    result[col] = groupRows[0][col];
                }
            }
            
            results.push(result);
        }
        
        // HAVING句でフィルタリング
        let filteredResults = results;
        if (having) {
            filteredResults = results.filter(result => {
                const { function: funcName, argument, operator, value } = having;
                const columnName = `${funcName}(${argument})`;
                const aggregateValue = result[columnName];
                
                return this.compareValues(aggregateValue, operator, value);
            });
        }
        
        // ORDER BY句でソート
        if (orderBy && orderBy.length > 0) {
            filteredResults.sort((a, b) => {
                for (const order of orderBy) {
                    const { column, direction } = order;
                    const aVal = a[column];
                    const bVal = b[column];
                    
                    let comparison = 0;
                    if (aVal < bVal) comparison = -1;
                    else if (aVal > bVal) comparison = 1;
                    
                    if (comparison !== 0) {
                        return direction === 'DESC' ? -comparison : comparison;
                    }
                }
                return 0;
            });
        }
        
        // OFFSET と LIMIT を適用
        if (offset !== null && offset !== undefined) {
            filteredResults = filteredResults.slice(offset);
        }
        if (limit !== null && limit !== undefined) {
            filteredResults = filteredResults.slice(0, limit);
        }
        
        return {
            type: 'SELECT',
            success: true,
            rows: filteredResults,
            rowCount: filteredResults.length
        };
    }

    /**
     * 値を比較
     */
    compareValues(left, operator, right) {
        switch (operator) {
            case '=': return left === right;
            case '!=': return left !== right;
            case '>': return left > right;
            case '<': return left < right;
            case '>=': return left >= right;
            case '<=': return left <= right;
            default: return false;
        }
    }

    /**
     * UPDATE文を実行
     */
    async executeUpdate(statement) {
        const { tableName, updates, where } = statement;

        // テーブルの存在チェック
        if (!this.dbManager.tableExists(tableName)) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // スキーマを取得
        const schema = await this.dbManager.getTableSchema(tableName);
        if (!schema) {
            throw new Error(`Schema for table '${tableName}' not found`);
        }

        // PRIMARY KEY情報を取得
        const primaryKey = await this.dbManager.getTablePrimaryKey(tableName);

        // 全データを取得
        let rows = await this.dbManager.getAll(tableName);

        // WHERE句でフィルタリング
        let targetRows = rows;
        if (where) {
            targetRows = rows.filter(row => evaluateWhereCondition(row, where));
        }

        // 更新を実行
        let updatedCount = 0;
        for (const row of targetRows) {
            // 更新データを適用
            for (const [columnName, value] of Object.entries(updates)) {
                // カラムがスキーマに存在するかチェック
                const columnSchema = schema.find(col => col.name === columnName);
                if (!columnSchema) {
                    throw new Error(`Column '${columnName}' does not exist in table '${tableName}'`);
                }

                // PRIMARY KEY制約のチェック
                if (primaryKey && columnName === primaryKey) {
                    // NULL値の禁止
                    if (value === null || value === undefined) {
                        throw new Error(`PRIMARY KEY column '${columnName}' cannot be NULL`);
                    }
                    
                    // 重複チェック（自分自身以外）
                    const duplicate = rows.find(r => r.__id__ !== row.__id__ && r[columnName] === value);
                    if (duplicate) {
                        throw new Error(`PRIMARY KEY constraint violation: duplicate value '${value}' for column '${columnName}'`);
                    }
                }

                // NOT NULL制約のチェック
                if (columnSchema.notNull && (value === null || value === undefined)) {
                    throw new Error(`NOT NULL constraint violation: column '${columnName}' cannot be NULL`);
                }

                // UNIQUE制約のチェック
                if (columnSchema.unique && value !== null && value !== undefined) {
                    // 重複チェック（自分自身以外）
                    const duplicate = rows.find(r => r.__id__ !== row.__id__ && r[columnName] === value);
                    if (duplicate) {
                        throw new Error(`UNIQUE constraint violation: duplicate value '${value}' for column '${columnName}'`);
                    }
                }

                // データ型の検証と変換
                if (value !== null) {
                    if (!validateDataType(value, columnSchema.type)) {
                        throw new Error(`Invalid data type for column '${columnName}': expected ${columnSchema.type}`);
                    }
                    // BLOB 型の場合は非同期変換が必要な場合がある
                    if (columnSchema.type.toUpperCase() === 'BLOB') {
                        row[columnName] = await convertToArrayBuffer(value);
                    } else {
                        row[columnName] = convertToDataType(value, columnSchema.type);
                    }
                } else {
                    row[columnName] = null;
                }
            }

            // データベースを更新
            await this.dbManager.update(tableName, row);
            updatedCount++;
        }

        return {
            type: 'UPDATE',
            success: true,
            rowCount: updatedCount
        };
    }

    /**
     * DELETE文を実行
     */
    async executeDelete(statement) {
        const { tableName, where } = statement;

        // テーブルの存在チェック
        if (!this.dbManager.tableExists(tableName)) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // 全データを取得
        let rows = await this.dbManager.getAll(tableName);

        // WHERE句でフィルタリング
        let targetRows = rows;
        if (where) {
            targetRows = rows.filter(row => evaluateWhereCondition(row, where));
        }

        // 削除を実行
        let deletedCount = 0;
        for (const row of targetRows) {
            await this.dbManager.delete(tableName, row.__id__);
            deletedCount++;
        }

        return {
            type: 'DELETE',
            success: true,
            rowCount: deletedCount
        };
    }

    /**
     * ALTER TABLE 文を実行
     */
    async executeAlterTable(ast) {
        const { tableName, action, column, columnName } = ast;

        if (action === 'ADD_COLUMN') {
            return await this.executeAddColumn(tableName, column);
        } else if (action === 'DROP_COLUMN') {
            return await this.executeDropColumn(tableName, columnName);
        } else {
            throw new Error(`Unsupported ALTER TABLE action: ${action}`);
        }
    }

    /**
     * ADD COLUMN を実行
     */
    async executeAddColumn(tableName, column) {
        // テーブルの存在確認
        const columns = await this.dbManager.getTableSchema(tableName);
        if (!columns) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // カラム名の重複チェック
        if (columns.some(col => col.name === column.name)) {
            throw new Error(`Column '${column.name}' already exists in table '${tableName}'`);
        }

        // PRIMARY KEY制約のチェック（テーブルに既にPRIMARY KEYがある場合はエラー）
        if (column.primaryKey) {
            const hasPrimaryKey = columns.some(col => col.primaryKey);
            if (hasPrimaryKey) {
                throw new Error(`Table '${tableName}' already has a PRIMARY KEY`);
            }
        }

        // NOT NULL制約とDEFAULT値のチェック
        if (column.notNull && !column.defaultValue) {
            // 既存の行がある場合、NOT NULL制約を持つカラムにはDEFAULT値が必要
            const existingRows = await this.dbManager.getAll(tableName);
            if (existingRows.length > 0) {
                throw new Error(`Cannot add NOT NULL column '${column.name}' without DEFAULT value to non-empty table`);
            }
        }

        // スキーマを更新
        columns.push({
            name: column.name,
            type: column.type,
            primaryKey: column.primaryKey || false,
            notNull: column.notNull || false,
            unique: column.unique || false,
            defaultValue: column.defaultValue || null
        });

        // PRIMARY KEY情報を取得
        const primaryKey = await this.dbManager.getTablePrimaryKey(tableName);

        await this.dbManager.updateTableSchema(tableName, { columns, primaryKey });

        // 既存の全行に新しいカラムを追加
        const existingRows = await this.dbManager.getAll(tableName);
        
        for (const row of existingRows) {
            let newValue = null;

            // DEFAULT値がある場合は評価
            if (column.defaultValue) {
                newValue = this.evaluateDefaultValue(column.defaultValue);
                // データ型の検証と変換
                if (!validateDataType(newValue, column.type)) {
                    throw new Error(`Invalid default value type for column '${column.name}': expected ${column.type}`);
                }
                newValue = convertToDataType(newValue, column.type);
            }

            // 新しいカラムを追加
            row[column.name] = newValue;

            // NOT NULL制約のチェック
            if (column.notNull && newValue === null) {
                throw new Error(`Column '${column.name}' cannot be NULL`);
            }

            // 行を更新
            await this.dbManager.update(tableName, row);
        }

        // UNIQUE制約がある場合、既存の値の重複チェック
        if (column.unique) {
            const values = existingRows.map(row => row[column.name]);
            const uniqueValues = new Set(values.filter(v => v !== null));
            if (uniqueValues.size !== values.filter(v => v !== null).length) {
                throw new Error(`UNIQUE constraint violation: duplicate values in column '${column.name}'`);
            }
        }

        return {
            type: 'ALTER_TABLE',
            success: true,
            message: `Column '${column.name}' added to table '${tableName}'`
        };
    }

    /**
     * DROP COLUMN を実行
     */
    async executeDropColumn(tableName, columnName) {
        // テーブルの存在確認
        const columns = await this.dbManager.getTableSchema(tableName);
        if (!columns) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // カラムの存在確認
        const columnIndex = columns.findIndex(col => col.name === columnName);
        if (columnIndex === -1) {
            throw new Error(`Column '${columnName}' does not exist in table '${tableName}'`);
        }

        // 最後のカラムの削除を禁止
        if (columns.length === 1) {
            throw new Error(`Cannot drop the last column '${columnName}' from table '${tableName}'`);
        }

        // PRIMARY KEYカラムの削除を禁止
        const columnToDelete = columns[columnIndex];
        if (columnToDelete.primaryKey) {
            throw new Error(`Cannot drop PRIMARY KEY column '${columnName}'`);
        }

        // スキーマからカラムを削除
        columns.splice(columnIndex, 1);

        // PRIMARY KEY情報を取得
        const primaryKey = await this.dbManager.getTablePrimaryKey(tableName);

        await this.dbManager.updateTableSchema(tableName, { columns, primaryKey });

        // 既存の全行からカラムを削除
        const existingRows = await this.dbManager.getAll(tableName);
        
        for (const row of existingRows) {
            delete row[columnName];
            await this.dbManager.update(tableName, row);
        }

        return {
            type: 'ALTER_TABLE',
            success: true,
            message: `Column '${columnName}' dropped from table '${tableName}'`
        };
    }

    /**
     * デフォルト値を評価
     */
    evaluateDefaultValue(defaultValue) {
        if (!defaultValue) {
            return null;
        }

        switch (defaultValue.type) {
            case 'STRING':
                return defaultValue.value;
            
            case 'NUMBER':
                return defaultValue.value;
            
            case 'NULL':
                return null;
            
            case 'FUNCTION':
                // 特殊関数の評価
                switch (defaultValue.value) {
                    case 'CURRENT_TIMESTAMP':
                        // ISO 8601形式の日時文字列を返す
                        return new Date().toISOString();
                    
                    case 'CURRENT_DATE':
                        // YYYY-MM-DD形式の日付文字列を返す
                        const date = new Date();
                        return date.toISOString().split('T')[0];
                    
                    case 'CURRENT_TIME':
                        // HH:MM:SS形式の時刻文字列を返す
                        const time = new Date();
                        return time.toISOString().split('T')[1].split('.')[0];
                    
                    default:
                        throw new Error(`Unknown default function: ${defaultValue.value}`);
                }
            
            default:
                throw new Error(`Unknown default value type: ${defaultValue.type}`);
        }
    }
}
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
     * データベース内の全テーブル名を取得
     * @returns {Promise<Array<string>>} テーブル名の配列
     */
    async listTables() {
        // 初期化されていない場合は初期化
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            return this.dbManager.getAllTableNames();
        } catch (error) {
            throw new Error(`Failed to list tables: ${error.message}`);
        }
    }

    /**
     * テーブルの詳細情報を取得
     * @param {string} tableName - テーブル名
     * @returns {Promise<Object>} テーブル情報（tableName, columns, primaryKey）
     */
    async describeTable(tableName) {
        if (!tableName || typeof tableName !== 'string') {
            throw new Error('Table name is required and must be a string');
        }

        // 初期化されていない場合は初期化
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            // テーブルが存在するかチェック
            if (!this.dbManager.tableExists(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            const tableInfo = await this.dbManager.getTableInfo(tableName);
            
            if (!tableInfo) {
                throw new Error(`Failed to get table information for '${tableName}'`);
            }

            return tableInfo;
        } catch (error) {
            throw new Error(`Failed to describe table: ${error.message}`);
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


// Export to global scope
if (typeof window !== 'undefined') {
    window.JSDB = JSDB;
}
