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
