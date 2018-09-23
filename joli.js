var joliCreator = function() {
    var joli = {
        each: function(collection, iterator, bind) {
            var i, l, property;

            switch (joli.getType(collection)) {
                case "array":
                    for (i = 0, l = collection.length; i < l; i++) {
                        iterator.call(bind, collection[i], i);
                    }
                    break;
                case "object":
                    for (property in collection) {
                        if (collection.hasOwnProperty(property)) {
                            iterator.call(bind, collection[property], property);
                        }
                    }
                    break;
            }
        },
        extend: function(baseClass, options) {
            var opt, prop;

            if (!this.options) {
                this.options = {};
            }

            this.parent = new baseClass(options);

            for (prop in this.parent) {
                this[prop] = this[prop] || this.parent[prop];
            }

            // copy base options over
            for (opt in this.parent.options) {
                this.options[opt] = this.options[opt] || this.parent.options[opt];
            }
        },
        getType: function(obj) {
            if (typeof obj === "undefined" || obj === null || (typeof obj === "number" && isNaN(obj))) {
                return false;
            } else if (obj.constructor === Array || (Array.isArray && Array.isArray(obj))) {
                return "array";
            } else {
                return typeof obj;
            }
        },
        // [Logical Labs] add some convenience type test functions
        isUndefined: function(obj) {
            return obj === void 0;
        },
        isDefined: function(obj) {
            return !(obj === void 0);
        },
        isObject: function(obj) {
            return joli.getType(obj) === "object";
        },
        isArray: function(obj) {
            return joli.getType(obj) === "array";
        },
        isFunction: function(obj) {
            return joli.getType(obj) === "function"
        },
        jsonParse: function(json) {
            return JSON.parse(json);
        },
        merge: function() {
            var i, l, prop;
            var mergedObject = {};

            for (i = 0, l = arguments.length; i < l; i++) {
                var object = arguments[i];

                if (joli.getType(object) !== "object") {
                    continue;
                }

                for (prop in object) {
                    if (object.hasOwnProperty(prop)) {
                        var objectProp = object[prop], mergedProp = mergedObject[prop];

                        if (mergedProp && joli.getType(objectProp) === "object" && joli.getType(mergedProp) === "object") {
                            mergedObject[prop] = joli.merge(mergedProp, objectProp);
                        } else {
                            mergedObject[prop] = objectProp;
                        }
                    }
                }
            }
            return mergedObject;
        },
        setOptions: function(options, defaults) {
            var opt;

            if (!options) {
                options = {};
            }

            if (!this.options) {
                this.options = {};
            }

            var mergedOptions = joli.merge(defaults, options);

            for (opt in defaults) {
                this.options[opt] = mergedOptions[opt];
            }
        },
        toQueryString: function(obj) {
            var queryStringComponents = [];

            if (!obj) {
                obj = {};
            }

            joli.each(obj, function(val, key) {
                var result = null;

                switch (joli.getType(val)) {
                    case "object":
                        result = joli.toQueryString(val);
                        break;
                    case "array":
                        result = joli.toQueryString(val);
                        break;
                    default:
                        result = encodeURIComponent(val);
                }

                if (result) {
                    queryStringComponents.push(key + '=' + result);
                }
            });
            return '[' + queryStringComponents.join("&") + ']';
        },
        typeValue: function(val) {
            if (!joli.getType(val)) {
                return "NULL";
            } else {
                // [Logical Labs] allow for nested data (objects, arrays) in val
                // to be serialized as a string for faster db interaction of large
                // amounts of data - requires you to handle (jsonParse) the data
                // after its retrieved when the data is expected to be serialized
                if ((joli.isObject(val)) || (joli.isArray(val))) {
                  val = JSON.stringify(val);
                }
                if (joli.getType(val) === "string") {
                    // escape single quotes and dollar signs.
                    // quotes are escaped for SQLite
                    val = val.replace(/'/g, "''");
                    // dollar signs are escaped for use in calling str.replace in
                    // JazzRecord.replaceAndClean()
                    val = val.replace(/\$/g, "$$$$");
                    val = "'" + val + "'";
                } else if (joli.getType(val) === "boolean") {
                    if (val) {
                        return "1";
                    } else {
                        return "0";
                    }
                }
            }

            return val;
        }
    };

    // define available titanium database modules
    joli.standardDatabaseModule = Titanium.Database;

    // database encyrption is handled by sqlcipher and via a module
    // Requires module for handling encrypted database installed in app

    // For iOS, we don't need to use the javascript interface for the module, so long as it is at least included in the project
    // It appeaars that so long as the project is built with the module we can just go around the interface and use
    // the Titanium.Database interface and set our password manually using sqlcipher's query method PRAGMA key = '<password>'
    // after opening the database
    // read above
    joli.encryptedDatabaseModule = Ti.Platform.name === 'android' ? require('appcelerator.encrypteddatabase') : Ti.Database;
    // read below
    // Notes for doing the above: on iOS when using the encrypted database module's javascript interfce (for open mainly)
    // on subsequent opens of different databases for the circuitDB or coompanyDB, it mistakenly tries to run cipher migrate
    // and for some reason that fails when attaching the database (one of the steps in the sqlcipher openAndMigrate method)
    // 1) I don't understand why the module thinks the cipher migration is necessary because the module version where this was
    // initially required is well past the internal setting of the version (at least 2.0.4 internally set)
    // 2) When the slqcipher method (openAndMigrate) runs, it is not clear to me why it is failing at the attach database step
    // 3) in both 1 and 2 above, it is not clear why it works initially but when switching to a different database it fails
    // (sometimes takes a few changes for the failure to show up)

    /**
     * Connection
     */
    joli.Connection = function(database, file, password, readonly) {
        var databaseModule,
        isAndroid = Titanium.Platform.osname === 'android',
        isIOS = (Ti.Platform.osname === 'iphone' || Ti.Platform.osname === 'ipad');
        // If iOS and a file object has been passed in, extract file basename wihout extension to use
        if (isIOS && typeof database === 'object') {
          database = database.name.replace(/(.*)\.(.*?)$/, "$1");
        }
        // password can be blank, just not undefined
        if (arguments.length < 3 || typeof password === 'undefined') {
          Ti.API.debug("Password is undefined for db "+database);
          this.encrypted = false;
        } else {
          // don't show password in log when built for production release!! - comment the line out below
          // Ti.API.debug("Password is "+password+" for db "+database);
          this.encrypted = true;
        }
        // this.readonly is only for Android due to encrypted database module limitation in android
        if (arguments.length < 4 || typeof readonly === 'undefined') {
          this.readonly = false;
        } else {
          this.readonly = readonly;
        }
        // if connection isn't to be for an encrypted database (detected by undefined password), use standard module
        if (!this.encrypted) {
          databaseModule = joli.standardDatabaseModule;
        } else {
          databaseModule = joli.encryptedDatabaseModule;
          // for encrpted database model, need to set the password in the module before connecting
          if (joli.encryptedDatabaseModule !== joli.standardDatabaseModule) {
            // don't show password in log when built for production release!! - comment the line out below
            // Ti.API.debug("Setting password using "+password+" for db "+database);
            databaseModule.password = password;
          }
        }
        // if a file argument is defined, install the database from the file to standard location
        if (file) {
          Ti.API.debug("Installing db "+database);
          this.database = databaseModule.install(file, database);
        // if file is not defined, the database is opened from its existing location
        } else {
          if (isAndroid && this.encrypted && !this.readonly && typeof database === 'object') {
            // If using encyrpted database on Android and not wanting readonly, need to make sure
            // we pass in an absolute file path as string, not a file object as there is currently a limitation
            // in the encrypted database module where if the argument is a fileproxy object, readonly will be true
            // Also, need to make sure it is an absolute path without the protocol prepended
            var dbFilePath = database.nativePath.replace('file://','');
            this.database = databaseModule.open(dbFilePath);
          } else {
            Ti.API.debug("Opening db "+database);
            this.database = databaseModule.open(database);
          }
        }
        // For iOS, we need to set the encryption key after connecting to the database if we aren't using
        // the encrypted database module where the password would have been set as a property on the module
        if (isIOS && this.encrypted && joli.encryptedDatabaseModule === joli.standardDatabaseModule) {
          // don't show password in log when built for production release!! - comment the line out below
          // Ti.API.debug("Setting password using "+password+" for db "+database);
          this.database.execute("PRAGMA key = '"+password+"'");
        }
        this.database.execute('PRAGMA read_uncommitted=true');
        // run a benign test that queries can be executed in the database (to test for access)
        // this is the same test that sqlcipher's android database library uses when connecting
        // so effectively this is here for iOS so we can have an exception thrown at connection
        // if we don't have a readable database (i.e. the password failed to decrypt)
        Ti.API.debug("Testing db "+database);
        this.database.execute("select count(*) from sqlite_master")
        Ti.API.debug("Database file opened: "+this.database.file.nativePath)
    };

    joli.Connection.prototype = {
        disconnect: function() {
          Ti.API.info("Closing database "+this.database.file.nativePath);
          this.database.close();
        },
        execute: function(query) {
            // Ti.API.debug(query);
            return this.database.execute(query);
        },
        lastInsertRowId: function() {
            return this.database.lastInsertRowId;
        }
    };

    /**
     * Migration description
     */
    joli.migration = function(options) {
        var defaults = {
            tableName: 'migration'
        };

        joli.setOptions.call(this, options, defaults);
        this.table = this.options.tableName;
    };

    joli.migration.prototype = {
        getVersion: function() {
            var q = new joli.query().select().from(this.table).order('version desc');
            var version = q.execute();

            if (version.length > 0) {
                return version[0].version;
            } else {
                q = new joli.query().insertInto(this.table).values({
                    version: 0
                });
                q.execute();
                return 0;
            }
        },
        setVersion: function(version) {
            var q = new joli.query().update(this.table).set({
                version: version
            });
            q.execute();
        }
    };

    /**
     * Model description
     */
    joli.model = function(options) {
        var defaults = {
            table: '',
            columns: {},
            objectMethods: {}
        };

        if (options.methods) {
            joli.each(options.methods, function(method, name) {
                this[name] = method;
            }, this);
        }

        joli.setOptions.call(this, options, defaults);
        this.table = this.options.table;

        if (!joli.models.has(this.table)) {
            joli.models.set(this.table, this);
        }
    };

    joli.model.prototype = {
        // return a query object for this model
        query: function() {
          return new joli.query().from(this.table);
        },
        all: function(constraints) {
            var q = new joli.query().select().from(this.table);

            if (!constraints) {
                constraints = {};
            }

            if (constraints.where) {
                joli.each(constraints.where, function(value, field) {
                    q.where(field, value);
                });
            }

            if (constraints.whereIn) {
                joli.each(constraints.whereIn, function(value, field) {
                    q.whereIn(field, value);
                });
            }

            if (constraints.order) {
                q.order(constraints.order);
            }

            if (constraints.limit) {
                q.limit(constraints.limit);
            }

            if (constraints.limit && constraints.offset) {
                q.offset(constraints.offset);
            }

            return q.execute();
        },
        count: function(constraints) {
            var q = new joli.query().count().from(this.table);

            if (!constraints) {
                constraints = {};
            }

            if (constraints.where) {
                joli.each(constraints.where, function(value, field) {
                    q.where(field, value);
                });
            }

            if (constraints.whereIn) {
                joli.each(constraints.whereIn, function(value, field) {
                    q.whereIn(field, value);
                });
            }

            return parseInt(q.execute(), 10);
        },
        // no callbacks, more efficient
        deleteRecords: function(id) {
            var q = new joli.query().destroy().from(this.table);

            if (joli.getType(id) === 'number') {
                q.where('id = ?', id);
            } else if (joli.getType(id) === 'array') {
                q.whereIn('id', id);
            }

            return q.execute();
        },
        exists: function(id) {
            var count = new joli.query().count().from(this.table).where('id = ?', id).execute();
            return (count > 0);
        },
        findBy: function(field, value) {
            return new joli.query().select().from(this.table).where(field + ' = ?', value).execute();
        },
        findById: function(value) {
            return this.findBy('id', value);
        },
        findOneBy: function(field, value) {
            var result = new joli.query().select().from(this.table).where(field + ' = ?', value).limit(1).execute();

            if (result.length === 0) {
                return false;
            } else {
                return result[0];
            }
        },
        // testing extending joli model with multiple where conditions and order together
        findOneUsingCompoundWhereOrderedBy: function(field,value,order) {
          var q = new joli.query().select().from(this.table);
          joli.each(constraints.where, function(value, field) {
              q.where(field, value);
          });
          var result = q.order(order).limit(1).execute();
          if (result.length === 0) {
              return false;
          } else {
              return result[0];
          }
        },
        findOneById: function(value) {
            return this.findOneBy('id', value);
        },
        getColumns: function() {
            return this.options.columns;
        },
        newRecord: function(values) {
            if (!values) {
                values = {};
            }

            var data = {};

            joli.each(this.options.columns, function(colType, colName) {
                data[colName] = (values[colName] === undefined) ? null : values[colName];
            });
            var record = new joli.record(this).fromArray(data);

            record.isNew = function() {
                return true;
            };
            // add object methods
            if (this.options.objectMethods) {
                joli.each(this.options.objectMethods, function(method, name) {
                    record[name] = method;
                });
            }

            return record;
        },
        save: function(data) {
            if (data.data.length === 0) {
                return;
            }

            var q = new joli.query();

            if (data.originalData) {
                // existing record
                q.update(this.table).set(data.data).where('id = ?', data.originalData.id);
            } else {
                // new record
                q.insertInto(this.table).values(data.data);
            }

            return q.execute();
        },
        // [Logical Labs] function for bulk loading many records at once and
        // is optimizable with transaction via useTransaction flag (consider as default?)
        load: function(recordsDataArray, options, callback) {
          var transaction = false;

          if (options && options.purgeFirst) {
            this.truncate();
          }

          // use a transaction around the collection of queries to optimize large record set
          if (options && options.useTransaction) {
            transaction = new joli.transaction("load")
            transaction.begin();
          }

          // determine if the record exists already and if we need to create it or update it
          joli.each(recordsDataArray, function(recordData, index) {
            var record = false;
            if (record = this.findOneById(recordData["id"])) {
              record.fromArray(recordData);
            } else {
              record = this.newRecord(recordData);
            }
            (record) && (record.save());
          }, this);

          if (transaction) {
            transaction.commit();
          }

          if (joli.isFunction(callback)) {
            callback();
          }
        },
        truncate: function() {
            new joli.query().destroy().from(this.table).execute();
        },
        // [Logical Labs] add options to post model construction - for adding methods later
        addOptions: function(options) {
           if (options.methods) {
               joli.each(options.methods, function(method, name) {
                   this[name] = method;
               }, this);
           }
          joli.setOptions.call(this, options, this.options);
        }
    };

    joli.Models = function() {
        this.models = {};
        this.migration = new joli.migration({
            tableName: 'migration'
        });
    };

    joli.Models.prototype = {
        get: function(table) {
            if (table !== undefined) {
                return this.models[table];
            } else {
                return this.models;
            }
        },
        has: function(table) {
            if (this.models[table]) {
                return true;
            } else {
                return false;
            }
        },
        initialize: function() {
            joli.each(this.models, function(model, modelName) {
                var columns = [];

                joli.each(model.options.columns, function(type, name) {
                    columns.push(name + ' ' + type);
                });
                var query = 'CREATE TABLE IF NOT EXISTS ' + modelName + ' (' + columns.join(', ') + ')';
                joli.connection.execute(query);
            });
        },
        migrate: function(version, migrationCallback) {
            // create migration table
            var query = 'CREATE TABLE IF NOT EXISTS ' + this.migration.table + ' (version)';
            joli.connection.execute(query);

            if (this.migration.getVersion() < version) {
                joli.each(this.models, function(model, modelName) {
                    var query = 'DROP TABLE IF EXISTS ' + modelName;
                    joli.connection.execute(query);
                });
                // optional migration callback
                if (migrationCallback && 'function' === joli.getType(migrationCallback)) {
                    migrationCallback({
                        table: this.migration.table,
                        newVersion: version
                    });
                }

                // insert migration
                this.migration.setVersion(version);
            }
        },
        set: function(table, model) {
            this.models[table] = model;
        }
    };

    joli.models = new joli.Models();

    joli.query = function() {
        this.data = {
            as: null,
            from: null,
            having: null,
            join: [],
            limit: null,
            operation: null,
            order: [],
            select_columns: '*',
            set: [],
            values: [],
            where: null
        };
    };

    joli.query.prototype = {
        count: function() {
            this.data.operation = 'count';
            return this;
        },
        destroy: function() {
            this.data.operation = 'delete';
            return this;
        },
        execute: function(hydratationMode) {
            return this.executeQuery(this.getQuery(), hydratationMode);
        },
        executeQuery: function(query, hydratationMode) {
            var rows;

            switch (this.data.operation) {
                case 'count':
                    rows = joli.connection.execute(query);
                    return this.getCount(rows);
                case 'insert_into':
                case 'insert_replace':
                    joli.connection.execute(query);
                    return joli.connection.lastInsertRowId();
                case 'select':
                    if (typeof hydratationMode === 'undefined') {
                        hydratationMode = 'object';
                    }
                    rows = joli.connection.execute(query);
                    return this.hydrate(rows, hydratationMode);
                default:
                    return joli.connection.execute(query);
            }
        },
        from: function(table) {
            this.data.from = table;
            return this;
        },
        as: function(table) {
            this.data.as = table;
            return this;
        },
        getCount: function(rows) {
            var result;

            if (null === rows) {
                return 0;
            }

            if (0 === rows.rowCount) {
                result = 0;
            } else {
                result = rows.fieldByName('total');
            }

            rows.close();
            return result;
        },
        getOperation: function() {
            switch (this.data.operation) {
                case 'count':
                    return 'select count(*) as total from ' + this.data.from;
                case 'delete':
                    return 'delete from ' + this.data.from;
                case 'insert_into':
                    return 'insert into ' + this.data.from + ' (' + this.data.set.join(', ') + ') values (' + this.data.values.join(', ') + ')';
                case 'insert_replace':
                    return 'insert or replace into ' + this.data.from + ' (' + this.data.set.join(', ') + ') values (' + this.data.values.join(', ') + ')';
                case 'replace':
                    return 'replace into ' + this.data.from + ' (' + this.data.set.join(', ') + ') values (' + this.data.values.join(', ') + ')';
                case 'select':
                    var join = '';

                    if (this.data.join.length > 0) {
                        joli.each(this.data.join, function(value, key) {
                            if (-1 === value[1].indexOf('.')) {
                                value[1] = value[0] + '.' + value[1];
                            }
                            join = join + ' left outer join ' + value[0] + ' on ' + value[1] + ' = ' + value[2];
                        });
                    }

                    return 'select ' + this.data.select_columns + ' from ' + this.data.from + join;
                case 'update':
                    return 'update ' + this.data.from + ' set ' + this.data.set.join(', ');
                default:
                    throw ("Operation type Error. joli.query operation type must be an insert, a delete, a select, a replace or an update.");
            }
        },
        getQuery: function() {
            var query = this.getOperation();

            if (this.data.where) {
                query += ' where ' + this.data.where;
            }

            if (this.data.groupBy) {
                query += ' group by ' + this.data.groupBy.join(', ');
            }

            if (this.data.having) {
                query += ' having ' + this.data.having;
            }

            if (this.data.order.length > 0) {
                query += ' order by ' + this.data.order.join(', ');
            }

            if (this.data.limit) {
                query += ' limit ' + this.data.limit;
            }

            if (this.data.limit && this.data.offset) {
                query += ' offset ' + this.data.offset;
            }

            return query;
        },
        groupBy: function(group) {
            if ('string' === joli.getType(group)) {
                group = [group];
            }

            this.data.groupBy = group;
            return this;
        },
        having: function(expression, value) {
            if (null !== this.data.having) {
                this.data.having += ' and ';
            } else {
                this.data.having = '';
            }

            // handle replacing multiple values
            if ('array' === joli.getType(value)) {
                var i = 0;

                // replace question marks one at a time from the array
                while (expression.indexOf('?') !== -1 && value[i] !== undefined) {
                    expression = expression.replace(/\?/i, '"' + value[i] + '"');
                    i++;
                }

                this.data.having += expression;
            } else {
                this.data.having += expression.replace(/\?/gi, '"' + value + '"');
            }

            return this;
        },
        hydrate: function(rows, hydratationMode) {
            var result = [];

            if (null === hydratationMode) {
                hydratationMode = 'object';
            }

            if (!rows) {
                return result;
            }

            var fieldCount = (typeof(rows.fieldCount) == "function") ? rows.fieldCount() : rows.fieldCount;

            switch (hydratationMode) {
                case 'array':
                    result = this.hydrateArray(rows, fieldCount);
                    break;
                case 'object':
                    result = this.hydrateObject(rows, fieldCount);
                    break;
                default:
                    throw ('Unknown hydratation mode "' + hydratationMode + '". hydratationMode must be "object" or "array"');
            }

            rows.close();
            return result;
        },
        hydrateArray: function(rows, fieldCount) {
            var result = [];
            var i;
            var rowData;

            while (rows.isValidRow()) {
                i = 0;
                rowData = {};

                while (i < fieldCount) {
                    rowData[rows.fieldName(i)] = rows.field(i);
                    i++;
                }

                result.push(rowData);
                rows.next();
            }

            return result;
        },
        hydrateObject: function(rows, fieldCount) {
            var result = [];
            var i;
            var record;
            var rowData;

            // use the model specified by as() first, then from()
            var model = joli.models.get(this.data.as || this.data.from);

            while (rows.isValidRow()) {
                i = 0;
                rowData = {};

                while (i < fieldCount) {
                    rowData[rows.fieldName(i)] = rows.field(i);
                    i++;
                }

                result.push(model.newRecord().fromArray(rowData));
                rows.next();
            }

            return result;
        },
        insertInto: function(table) {
            this.data.operation = 'insert_into';
            this.data.from = table;
            return this;
        },
        insertReplace: function(table) {
            this.data.operation = 'insert_replace';
            this.data.from = table;
            return this;
        },
        join: function(table, local_id, foreign_id) {
            this.data.join.push([table, local_id, foreign_id]);
            return this;
        },
        limit: function(limit) {
            this.data.limit = limit;
            return this;
        },
        offset: function(offset) {
            this.data.offset = offset;
            return this;
        },
        order: function(order) {
            if ('string' === joli.getType(order)) {
                order = [order];
            }

            this.data.order = order;
            return this;
        },
        replace: function(table) {
            this.data.operation = 'replace';
            this.data.from = table;
            return this;
        },
        select: function(columns) {
            this.data.operation = 'select';

            if (columns) {
                this.data.select_columns = columns;
            }

            return this;
        },
        set: function(values) {
            joli.each(values, function(expression, value) {
                if (-1 === value.indexOf('=')) {
                    this.data.set.push(value + ' = ' + joli.typeValue(expression));
                } else {
                    // some particular expression containing "="
                    this.data.set.push(value);
                }
            }, this);
            return this;
        },
        update: function(table) {
            this.data.operation = 'update';
            this.data.from = table;
            return this;
        },
        values: function(values) {
            joli.each(values, function(expression, value) {
                this.data.set.push(value);
                this.data.values.push(joli.typeValue(expression));
            }, this);
            return this;
        },
        where: function(expression, value) {
            if (null !== this.data.where) {
                this.data.where += ' and ';
            } else {
                this.data.where = '';
            }

            // handle replacing multiple values
            if ('array' === joli.getType(value)) {
                var i = 0;

                // replace question marks one at a time from the array
                while (expression.indexOf('?') !== -1 && value[i] !== undefined) {
                    expression = expression.replace(/\?/i, '"' + value[i] + '"');
                    i++;
                }

                this.data.where += expression;
            } else {
                this.data.where += expression.replace(/\?/gi, '"' + value + '"');
            }

            return this;
        },
        whereIn: function(expression, value) {
            if (null !== this.data.where) {
                this.data.where += ' and ';
            } else {
                this.data.where = '';
            }

            if ('array' === joli.getType(value)) {
                if (0 === value.length) {
                    return this;
                }
                value = '(\'' + value.join('\', \'') + '\')';
            }

            this.data.where += expression + ' in ' + value;
            return this;
        }
    };

    joli.record = function(table) {
        this._options = {
            table: table
        };
        this._data = {};
        this._originalData = null;
    };

    joli.record.prototype = {
        destroy: function() {
            if (typeof this.id === 'undefined') {
                throw ("Unsaved record cannot be destroyed");
            } else {
                this._options.table.deleteRecords(this.id);
            }
        },
        fromArray: function(data) {
            var wasNew = this.isNew ? this.isNew() : true;

            this._originalData = this._originalData || {};
            if (typeof data.id !== 'undefined') {
                this.isNew = function() {
                    return false;
                };
            } else if (wasNew) {
                this.isNew = function() {
                    return true;
                };
            }

            joli.each(this._options.table.getColumns(), function(colType, colName) {
                this[colName] = null;
                this[colName] = data[colName];
                this._data[colName] = null;
                this._data[colName] = data[colName];

                if ((this._originalData && !this._originalData[colName]) || this.isNew()) {
                    this._originalData[colName] = data[colName];
                }
            }, this);
            return this;
        },
        get: function(key) {
            return this[key];
        },
        isChanged: function() {
            if (this.isNew()) {
                return false;
            }

            return !((typeof this.id !== 'undefined') && joli.toQueryString(this._data) === joli.toQueryString(this._originalData));
        },
        save: function() {
            var data = {
                data: this._data
            };

            if (this.isChanged()) {
                data.originalData = this._originalData;
                this._options.table.save(data);
            } else if (this.isNew()) {
                var rowid = this._options.table.save(data);

                if (!data.id) {
                    this._data.id = rowid;
                }
            }

            // overwrite original data so it is no longer "dirty" OR so it is no
            // longer new
            this._originalData = {};
            var newData = {};

            joli.each(this._options.table.getColumns(), function(colType, colName) {
                this._originalData[colName] = this._data[colName];
                newData[colName] = this._data[colName];
                this[colName] = this._data[colName];
            }, this);

            this._data = newData;

            this.isNew = function() {
                return false;
            };
            return true;
        },
        set: function(key, value) {
            this[key] = value;
            this._data[key] = value;
        },
        toArray: function() {
            var result = {};

            joli.each(this._options.table.getColumns(), function(colType, colName) {
                result[colName] = this._data[colName];
            }, this);
            return result;
        }
    };

    joli.transaction = function(name) {
        this.data = {
            commited: false
        };
    };

    joli.transaction.prototype = {
        begin: function() {
            joli.connection.execute('BEGIN;');
        },

        commit: function() {
            if (this.data.commited) {
                throw new Error('The transaction was already commited!');
            }

            joli.connection.execute('COMMIT;');
            this.data.commited = true;
        }
    };

    return joli;
};


/**
 * Global joli object for non-CommonJS usage:
 *  Ti.include('joli.js);
 *  joli.connection = new joli.Connection('your_database_name');
 */
var joli = joliCreator();


/**
 * In case joli.js is loaded as a CommonJS module
 * var joli = require('joli').connect('your_database_name');
 * var joli = require('joli').connect('your_database_name', '/path/to/database.sqlite');
 */
if (typeof exports === 'object' && exports) {
    exports.connect = function(database, file, password,readonly) {
        var joli = joliCreator();

        if (database) {
            if (file) {
                joli.connection = new joli.Connection(database, file, password,readonly);
            } else {
                joli.connection = new joli.Connection(database, undefined, password,readonly);
            }
        }

        return joli;
    };
}