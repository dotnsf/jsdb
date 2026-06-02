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
