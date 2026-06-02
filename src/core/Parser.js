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
