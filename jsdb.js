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
            else if (this.isAlpha(char)) {
                this.tokenizeIdentifier();
            }
            // 名前付きプレースホルダー (:name)
            else if (char === ':' && this.isAlpha(this.sql[this.position + 1])) {
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

            if (this.isAlphaNumeric(char) || char === '_') {
                value += char;
                this.position++;
            } else {
                break;
            }
        }

        const upperValue = value.toUpperCase();
        const keywords = [
            'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES',
            'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE',
            'AND', 'OR', 'NOT', 'NULL', 'LIKE',
            'INTEGER', 'TEXT', 'REAL', 'BLOB', 'DATE', 'DATETIME'
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

        while (this.position < this.sql.length && this.isAlphaNumeric(this.sql[this.position])) {
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
     * 文字かチェック
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
     * 英数字かチェック
     */
    isAlphaNumeric(char) {
        return /[a-zA-Z0-9]/.test(char);
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
        
        const tableName = this.expect('IDENTIFIER').value;
        
        this.expect('SYMBOL', '(');
        
        const columns = [];
        while (this.current() && this.current().value !== ')') {
            const columnName = this.expect('IDENTIFIER').value;
            const columnType = this.expect('KEYWORD').value;
            
            columns.push({
                name: columnName,
                type: columnType
            });
            
            // カンマがあれば次のカラムへ
            if (this.current() && this.current().value === ',') {
                this.advance();
            }
        }
        
        this.expect('SYMBOL', ')');
        
        return {
            type: 'CREATE_TABLE',
            tableName: tableName,
            columns: columns
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
        
        // カラムリスト
        const columns = [];
        while (this.current() && this.current().value !== 'FROM') {
            if (this.current().type === 'OPERATOR' && this.current().value === '*') {
                columns.push('*');
                this.advance();
            } else if (this.current().type === 'IDENTIFIER') {
                columns.push(this.current().value);
                this.advance();
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
        
        return {
            type: 'SELECT',
            columns: columns,
            tableName: tableName,
            where: whereCondition
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
        const { tableName, columns } = statement;

        // テーブルが既に存在するかチェック
        if (this.dbManager.tableExists(tableName)) {
            throw new Error(`Table '${tableName}' already exists`);
        }

        // テーブルを作成
        await this.dbManager.createTable(tableName, columns);

        // スキーマ情報を保存
        await this.dbManager.saveTableSchema(tableName, columns);

        return {
            type: 'CREATE_TABLE',
            success: true,
            message: `Table '${tableName}' created successfully`
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
        const { tableName, columns, where } = statement;

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

        // カラムの選択
        if (!columns.includes('*')) {
            rows = rows.map(row => {
                const selectedRow = {};
                for (const col of columns) {
                    if (row.hasOwnProperty(col)) {
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
     * テーブルのスキーマ情報を保存
     */
    async saveTableSchema(tableName, columns) {
        const transaction = this.db.transaction(['__metadata__'], 'readwrite');
        const store = transaction.objectStore('__metadata__');

        return new Promise((resolve, reject) => {
            const request = store.put({
                key: `schema_${tableName}`,
                tableName: tableName,
                columns: columns
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error(`Failed to save schema: ${request.error}`));
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
     * テーブルが存在するかチェック
     */
    tableExists(tableName) {
        return this.db.objectStoreNames.contains(tableName);
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
