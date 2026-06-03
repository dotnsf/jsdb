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
