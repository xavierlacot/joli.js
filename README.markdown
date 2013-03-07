# joli.js, a light js ORM for Appcelerator Titanium

## Presentation of joli.js
joli.js is a simple ORM for [Appcelerator Titanium mobile](http://www.appcelerator.com/products/titanium-mobile-application-development/) projects. It was built borrowing large parts of the code of [JazzRecord](http://www.jazzrecord.org/), a more general and complex javascript ORM. Praise and kudos to them!

joli.js is widely unit-tested. Go check [the demo application](https://github.com/xavierlacot/joli.js-demo/) in order to run the test suite.

## What does "joli" stand for?
"joli" means in French "nice", "tiny". Just what joli.js tries to be.

## Download and install
The source code of joli.js is [available on GitHub](https://github.com/xavierlacot/joli.js). Just grab it and include it in your Titanium project using either `Titanium.include()` or the CommonJS `require()`statement:

    Titanium.include('joli.js');

or (please note the missing ".js" suffix):

    var joli = require('path/to/joli').connect('your_database_name');

The latter integration mode must be prefered, as it helps sandboxing external libraries. Loading joli.js with `require()` will also allow to use several databases in the same application, which is not possible with `Ti.include()`:

    var joliLibrary = require('path/to/joli');
    var database1 = joliLibrary.connect('first_database');
    var database2 = joliLibrary.connect('second_database');

It is also possible to install existing databases bundled with the application:

    var joli = require('path/to/joli').connect('your_database_name', '/path/to/database.sqlite');


## Configuration

### Database connection creation
If you included joli.js with `Titanium.include()`, there is one single required configuration step: configuring the database name. This can be done in only one line, which has to be put before every call to joli.js's API:

    joli.connection = new joli.Connection('your_database_name');

If you prefered to load joli.js as a CommonJS module, it is not necessary to write this configuration instruction. However, you still may want to change the database name of a connection, and in that case you'll want to use this command.

### Models configuration
Prior inserting data and querying your models, you must declare these models. This is done by instantiating the class "joli.model":

    var city = new joli.model({
      table:    'city',
      columns:  {
        id:                 'INTEGER',
        name:               'TEXT',
        description:        'TEXT'
      }
    });

If your application uses a lot of models, I advice to bind all of these in a `models` variable, which will contain every models:

    var models = (function() {
      var m = {};

      m.human = new joli.model({
        table:    'human',
        columns:  {
          id:                 'INTEGER PRIMARY KEY AUTOINCREMENT',
          city_id:            'INTEGER',
          first_name:         'TEXT',
          last_name:          'TEXT'
        },
        methods: {
          countIn:  function(cityName) {
            // search for the city id
            var city = joli.models.get('city').findOneBy('name', cityName);

            if (!city) {
              throw 'Could not find a city with the name ' + cityName + '!';
            } else {
              return this.count({
                where: {
                  'city_id = ?': city.id
                }
              });
            }
          }
        },
        objectMethods: {
          move:  function(newCityName) {
            // search for the city id
            var city = joli.models.get('city').findOneBy('name', newCityName);

            if (!city) {
              throw 'Could not find a city with the name ' + newCityName + '!';
            } else {
              this.set('city_id', city.id);
            }
          }
        }
      });

      m.city = new joli.model({
        table:    'city',
        columns:  {
          id:                 'INTEGER PRIMARY KEY AUTOINCREMENT',
          country_id:         'INTEGER',
          name:               'TEXT',
          description:        'TEXT'
        }
      });

      m.country = new joli.model({
        table:    'country',
        columns:  {
          id:                 'INTEGER PRIMARY KEY AUTOINCREMENT',
          name:               'TEXT'
        }
      });

      return m;
    })();


The parameters array, which allows to configure a model, may contain several keys:

* `table`: the table name,
* `columns`: the name of the various columns proposed by the model. For each of them, it is required to specify their type (`INTEGER`, `TEXT` or `FLOAT`),
* `methods`: a table of class-level methods, in order to extend the model (see the `countIn` method upper). Note: these methods will be added to the model definition, not its instances,
* `objectMethods`: a table of object-level methods, which allow to extend the model instances (see the `move` method upper).

## Usage
This section describes the way on how to use joli.js.

### Tables initialisation
At the first launch of an application on a device, it is required to create the tables associated with the models, with the required fields. Of course, joli.js helps initialising the database: simple call the `joli.models.initialize()` method once the models have been defined:

    var city = new joli.model({
      table:    'city',
      columns:  {
        id:                 'INTEGER',
        name:               'TEXT',
        description:        'TEXT'
      }
    });

    joli.models.initialize();


Would you like the "id" to get auto-incremented, just add the informations "PRIMARY KEY AUTOINCREMENT" to the column definition :

    var city = new joli.model({
      table:    'city',
      columns:  {
        id:                 'INTEGER PRIMARY KEY AUTOINCREMENT',
        name:               'TEXT',
        description:        'TEXT'
      }
    });


### Data insertion
Inserting data can be done using the `newRecord()` method of a model:

    // create the record (not persisted)
    var john = models.human.newRecord({
      first_name: 'John',
      last_name: 'Doe'
    });

    // move him to New York
    john.move('New York');

    // persist it
    john.save();

You may also want to create a record using the instance class directly:

    var john = new joli.record(models.human);
    john.fromArray({
      first_name: 'John',
      last_name: 'Doe'
    });

    // move him to New York
    john.move('New York');

    // persist it
    john.save();

The first method is however advised, as it performs some checks on the existence of the columns.


### Data retrieval and Query API
Retrieving data is often a pain. For all the models, joli.js implements some magic finders in the model classes:

* `findBy(field, value)` allows to retrieve a list of the records having a specific value for one of its fields
* `findById(id)` allows to retrieve a list of the records having a specific id
* `findOneBy(field, value)` allows to retrieve one record having a specific value for one of its fields. If several records match the criteria, then only the first one will be returned
* `findOneById(id)` allows to retrieve one record having a specific id

But of course, you will want to perform more complex searches. This is where the query API enters in the dance. This query API allows to create `joli.query` objects, which are turned into real SQL queries by the ORM when executing the query.

This is particularly powerful when you want to add restrictions to the query in conditional statements:

    var q = new joli.query()
      .select('human.*')
      .from('human')
      .order(['last_name desc', 'first_name asc']);

    if (win.city_id) {
      q.where('city_id = ?', win.city_id);
    }

    if (win.last_name) {
      q.where('last_name LIKE ?', '%' + win.last_name + '%');
    }

    if (win.city_name) {
      q.where('city.name = ?', win.city_name);
      q.join('city', 'city.id', 'human.city_id');
    }

    var humans = q.execute();

The Query API supports lots of things. Just have a check at the `joli.query` class, or look at the samples provided in [the joli.query test suite](https://github.com/xavierlacot/joli.js-demo/blob/master/Resources/test/query.js)!

For instance, the following query syntaxes are supported by the API:

    var q = new joli.query()
      .select()
      .from('human')
      .whereIn('last_name', [ 'Doe', 'Smith' ]);


    var q = new joli.query()
      .select()
      .from('view_count')
      .where('nb_views between ? and ?', [1000, 2000]);

In some cases however, you will find this way of querying your models just too long, and you will prefer an other alternative syntax (Criteria-style querying API):

    var humans = models.human.all({
      where: {
        'city_id = ?': win.city_id
      },
      order: ['last_name desc', 'first_name asc']
    });

### Data retrieval for queries with no specific model (eg, GROUP BY)

Some query results can't be mapped back to a Joli model.  For example, when using a `GROUP BY` statement:

    SELECT city, COUNT(*) as count
    FROM human
    GROUP BY city

The rows returned by the above query are not Joli models, but simple `[city, count]` tuples.
    
To avoid having Joli try to map the query results to a model, you can pass a string parameter `"array"` to the 
`.execute()` function to have the results returned as an array of simple objects:

    var q = new joli.query()
        .select('city, COUNT(*) as count')
        .from('human')
        .groupBy('city')
        .execute("array");

## Internals
joli.js is made of several classes:

* `joli`, which is a convenience class for storing utilities,
* `joli.Connection`, which handles the real connection to the database,
* `joli.model`, which allows to perform some operations on a model,
* `joli.Models`, which acts as a hashmap of the models, and allows to initialise the database,
* `joli.query`, allows to write queries in a OOP style,
* and, finally, `joli.record` represents a record and contains useful methods.

You may want to override some of these classes for your convenience (for instance, for implementing an automatic synchronisation with a REST web service)... Just feel free to contribute back your changes!

## Howtos
This section gives some clues about how to use joli.js. It will be updated when questions will be sent to me about joli.js.

### Lost the tables reference
Would you have a specific part of your code where your models can not be accessed using the `models` object, it is still possible to access it using the method `joli.models.get()`. In other words:

    models.human == joli.models.get('human');

### Are there demo joli.js applications in the wild?
There are at the moment three open source applications using joli.js:

* [xavccMobileApp](https://github.com/xavierlacot/xavccMobileApp) is an url shortening application which uses joli.js for storing shortened urls in a local cache;
* [joli.js-demo](https://github.com/xavierlacot/joli.js-demo/) is a demo application, which contains the unit-tests for joli.js;
* [joli.api.js-demo](https://github.com/xavierlacot/joli.api.js-demo/) is an Iphone Addressbook-like application, which content gets synchronized with web services. This application was built in a couple of hours and was presented a a demo app at [CodeStrong](http://codestrong.com/) in 2011.

### Use several databases in the same application
It is possible to use several databases with joli.js by loading the library as a CommonJS module:

    var joliLibrary = require('path/to/joli');
    var database1 = joliLibrary.connect('first_database');
    var database2 = joliLibrary.connect('second_database');

## Credits and support
joli.js has been developed by [Xavier Lacot](http://lacot.org/) and is licensed under the MIT license. The joli.js project is sponsored by [JoliCode](http://jolicode.com/).

Please use GitHub in order to report bugs, but you may also ask for help on how to use joli.js by sending me a mail directly. My email address is xavier@lacot.org.

## Changelog

### Master
* added the `replace()` for building queries (thanks benjaminVadon)

### Version 0.4 - 2012-06-21
* turned joli.js as a commonjs module
* added the possibility to install an existing database bundled with the app
* added a `as()` method for building queries with `join()` (thanks nicjansma)
* fixed a bug in the query `where()` method, when a value was 0 or '' (thanks nicjansma)
* added a `toArray()` method on record instances
* fixed missing semicolon (jslint inside)
* adding optional migration callback to make migrations more general in usage (thanks Anthony Roldan)
* updated the documentation

### Version 0.3 - 2011-07-22
* added a lot of unit tests [in the demonstration application](https://github.com/xavierlacot/joli.js-demo/). Most ORM features are now unit-tested.
* selection now return object collections
* added support for several hydratation modes
* joli.js now validates through [jshint](http://jshint.com/)
* introduced `joli.model.truncate()`, which empties the table associated to a model
* introduced `joli.record.get()`, which allows to acces one record's properties
* made `joli.query.join()` able to complete the joined field names in the format table.field
* fixed `joli.query.whereIn()` which was buggy for textual values
* fixed a variable-reference bug in joli.record.save(), which led to an inconsistent behavior of joli.record.isChanged()

### Version 0.2 - 2011-06-20

* added object-level methods, and fixed the documentation accordingly

### Version 0.1 - 2010-11-15
Initial public release. Features a simple ActiveRecord implementation, along with an OOP query API.
