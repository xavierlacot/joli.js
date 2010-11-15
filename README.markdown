# joli.js, a light js ORM for Appcelerator Titanium

## Presentation of joli.js
joli.js is a simple ORM for [Appcelerator Titanium mobile](http://www.appcelerator.com/products/titanium-mobile-application-development/) projects. It was built borrowing large parts of the code of [JazzRecord](http://www.jazzrecord.org/), a more general and complex javascript ORM. Praise and kudos to them!

## What does "joli" stand for?
"joli" means in French "nice", "tiny". Just what joli.js tries to be.

## Download and install
Just grab joli.js (a single file), and include it in your Titanium project using

    Titanium.include('joli.js');

The sources are [available on GitHub](https://github.com/xavierlacot/joli.js).

## Configuration

### Database connection creation
There is one single required step in the configuration of joli.js: configuring the database name. This can be done in only one line, which has to be put before every call to joli.js's API:

    joli.connection = new joli.Connection('your_database_name');

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
      m.human = new joli.model({
        table:    'human',
        columns:  {
          id:                 'INTEGER',
          city_id:            'INTEGER',
          first_name:         'TEXT',
          last_name:          'TEXT'
        },
        methods: {
          move:  function(newCityName) {
            // search for the city id
            var city = joli.models.get('city').findOneBy('name', newCityName);

            if (!city) {
              throw 'Could not find a city with this name!';
            } else {
              this.city_id = city.id;
            }
          }
        }
      });

      m.city = new joli.model({
        table:    'city',
        columns:  {
          id:                 'INTEGER',
          country_id:         'INTEGER',
          name:               'TEXT',
          description:        'TEXT'
        }
      });

      m.country = new joli.model({
        table:    'country',
        columns:  {
          id:                 'INTEGER',
          name:               'TEXT'
        }
      });

      return m;
    })();


The parameters array, which allows to configure a model, may contain several keys:

* `table`: the table name,
* `columns`: the name of the various columns proposed by the model. For each of them, it is required to specify their type (`INTEGER`, `TEXT` or `FLOAT`),
* `methods`: a table of methods, in order to extend the model (see the `move` method upper)

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

The first method i however adviced, as it performs some checks on the existence of the columns.


### Data retrieval and Query API
Retrieving data is often a pain. For all the models, joli.js implements some magic finders in the model classes:

* `findBy(field, value)` allows to retrieve a list of the records having a specific value for one of its fields
* `findById(id)` allows to retrieve a list of the records having a specific id
* `findOneBy(field, value)` allows to retrieve one record having a specific value for one of its fields. If several records match the criteria, then onl the first one will be returned
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

The Query API supports lots of things. Just have a check at the joli.query class!

In some cases however, you will find this way of querying your models just too long, and you will prefer an other alternative syntax (Criteria-style querying API):

    var humans = models.human.all({
      where: {
        'city_id = ?': win.city_id
      },
      order: ['last_name desc', 'first_name asc']
    });


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

## Credits and support
joli.js has been developed by [Xavier Lacot](http://lacot.org/) and is
licensed under the MIT license.

Please use GitHub in order to report bugs, but you may also ask for help on how to use joli.js by sending me a mail directly. My email address is xavier@lacot.org.

## Changelog

### Version 0.1 - 2010-11-15
Initial public release. Features a simple ActiveRecord implementation, along with an OOP query API.