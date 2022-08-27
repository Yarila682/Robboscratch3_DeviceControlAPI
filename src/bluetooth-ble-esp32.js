
import {DEVICES} from './chrome';



const DEVICE_SERIAL_NUMBER_PROBE_INTERVAL = 50;
const DEVICE_SERIAL_NUMBER_LENGTH = 52;

const NULL_COMMAND_TIMEOUT = 1 * 5 * 1000;
const CHECK_SERIAL_NUMBER_FLUSH_TIMEOUT = 500;

const DEVICE_HANDLE_TIMEOUT_MAX = 100000;
const NO_RESPONSE_TIME_MAX = 100000;
const NO_START_TIMEOUT_MAX = 100000;

const DEVICE_HANDLE_TIMEOUT_DEFAULT = 10000;
const NO_RESPONSE_TIME_DEFAULT = 3000;
const NO_START_TIMEOUT_DEFAULT = 3000;
const UNO_TIMEOUT_DEFAULT = 3000;


var DEVICE_HANDLE_TIMEOUT = DEVICE_HANDLE_TIMEOUT_DEFAULT;
var NO_RESPONSE_TIME = NO_RESPONSE_TIME_DEFAULT;
var NO_START_TIMEOUT = NO_START_TIMEOUT_DEFAULT;
var UNO_TIMEOUT = UNO_TIMEOUT_DEFAULT;



const DEVICE_STATES = Object.freeze({
  "INITED": 0,
  "CLOSING": 1,
  "CONNECTED":2,
  "DEVICE_CHECKING": 3,
  "DEVICE_IS_RUBBISH": 4,
  "DEVICE_PURGING": 5,
  "DEVICE_IS_READY": 6,
  "DEVICE_ERROR":7,
  "TIMEOUT":8
});


const last_firmwares =[10,5,2,3,1,2,3,7];



// const log = console.log;
// var can_log = true;
// console.log = function(string){
//   if(can_log){
//         log(string);
//   }
// }

console.log("Robboscratch3_DeviceControlAPI-bluetooth-ble-module-version-0.0.1");

var arrDevices = [];






// Запустить выбор Bluetooth устройства и подключиться к выбранному
function connect() {
  return (deviceCache ? Promise.resolve(deviceCache) :
      requestBluetoothDevice()).
      then(device => connectDeviceAndCacheCharacteristic(device)).
     // then(characteristic => startNotifications(characteristic)).
      catch(error => log(error));
}

// Запрос выбора Bluetooth устройства
function requestBluetoothDevice() {
  log('Requesting bluetooth device...');

  return navigator.bluetooth.requestDevice({
   // filters: [/*{services: ['4fafc201-1fb5-459e-8fcc-c5c9c331914b']}*/],
   acceptAllDevices:true,
   optionalServices: ['4fafc201-1fb5-459e-8fcc-c5c9c331914b']
  }).
      then(device => {
        log('"' + device.name + '" bluetooth device selected');
        deviceCache = device;
        deviceCache.addEventListener('gattserverdisconnected',
            handleDisconnection);

        return deviceCache;
      }).catch(function(error) {
        console.error("Something went wrong. " + error);
      });
}

// Обработчик разъединения
function handleDisconnection(event) {
  let device = event.target;

  log('"' + device.name +
      '" bluetooth device disconnected, trying to reconnect...');

  connectDeviceAndCacheCharacteristic(device).
      then(characteristic => startNotifications(characteristic)).
      catch(error => log(error));
}

// Подключение к определенному устройству, получение сервиса и характеристики
function connectDeviceAndCacheCharacteristic(device) {
  if (device.gatt.connected && characteristicCache) {
    return Promise.resolve(characteristicCache);
  }

  log('Connecting to GATT server...');

  return device.gatt.connect().
      then(server => {
        log('GATT server connected, getting service...');

        return server.getPrimaryService('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
      }).
      then(service => {
        log('Service found, getting characteristic...');

        return Promise.all([service.getCharacteristic('6f8ea403-3643-44e4-bbb4-d29555351bc8'),
                            service.getCharacteristic('31a685ee-c764-4098-80d8-d3064801dee7'),
                            service.getCharacteristic('23b74619-5ed0-4bf1-b982-364c343bdba4')
                          ])
      }).
      then(characteristics => {
        log('Characteristics found');
        //characteristicCache = characteristic;

        characteristics.forEach(
          characteristic => {
            console.warn(characteristic);
            if (characteristic.uuid != '6f8ea403-3643-44e4-bbb4-d29555351bc8'){
                charactericsDictionary[characteristic.uuid] = characteristic;

            }else{
                characteristicSerialNumber = characteristic;
            }

          }
        );

        characteristicCache = charactericsDictionary;

        return characteristicCache;
      });
}

// Включение получения уведомлений об изменении характеристики
function startNotifications(characteristic) {
  log('Starting notifications...');

  return characteristic.startNotifications().
      then(() => {
        log('Notifications started');
        characteristic.addEventListener('characteristicvaluechanged',
            handleCharacteristicValueChanged);
      }).catch(function(error) {
        console.error("Something went wrong. " + error);
      });
}

// Получение данных
function handleCharacteristicValueChanged(event) {
  let value = new TextDecoder().decode(event.target.value);

  for (let c of value) {
    if (c === '\n') {
      let data = readBuffer.trim();
      readBuffer = '';

      if (data) {
        receive(data);
      }
    }
    else {
      readBuffer += c;
    }
  }
}

// Обработка полученных данных
function receive(data) {
  log(data, 'in');
}

// Вывод в терминал
function log(data, type = '') {

}

// Отключиться от подключенного устройства
function disconnect() {
  if (deviceCache) {
    log('Disconnecting from "' + deviceCache.name + '" bluetooth device...');
    deviceCache.removeEventListener('gattserverdisconnected',
        handleDisconnection);

    if (deviceCache.gatt.connected) {
      deviceCache.gatt.disconnect();
      log('"' + deviceCache.name + '" bluetooth device disconnected');
    }
    else {
      log('"' + deviceCache.name +
          '" bluetooth device is already disconnected');
    }
  }

  if (characteristicCache) {
    characteristicCache.removeEventListener('characteristicvaluechanged',
        handleCharacteristicValueChanged);
    characteristicCache = null;
  }

  deviceCache = null;
}

// Отправить данные подключенному устройству
function send(data) {
  data = String(data);

  if (!data || !characteristicCache) {
    return;
  }

  data += '\n';

  if (data.length > 20) {
    let chunks = data.match(/(.|[\r\n]){1,20}/g);

    writeToCharacteristic(characteristicCache, chunks[0]);

    for (let i = 1; i < chunks.length; i++) {
      setTimeout(() => {
        writeToCharacteristic(characteristicCache, chunks[i]);
      }, i * 100);
    }
  }
  else {
    writeToCharacteristic(characteristicCache, data);
  }

  log(data, 'out');
}

// Записать значение в характеристику
function writeToCharacteristic(characteristic, data) {
  characteristic.writeValue(new TextEncoder().encode(data));
}

function readSerialNumber(characteristicSerialNumber){

  characteristicSerialNumber.readValue().then(data_view => {

    let value = new TextDecoder().decode(data_view);

    if (value){
      log(value,"in");
    }

  }).catch(err => console.error(err)); 

}

function read(characteristic_cache){

  for (characteristic_id in characteristic_cache){

      let characteristic  = characteristic_cache[characteristic_id];
      console.warn(characteristic_id);
      console.warn(characteristic);
  

  characteristic.readValue().then(data_view => {

    //let value = data_view.getUint8(0,true);

    let bufIncoming = new Uint8Array(data_view.buffer);

    let value = bufIncoming[3];

   if (value){
      log(value,"in");
    }

  }).catch(err => console.error(err)); 

  }
}


function InterfaceDevice(device) {

    { 
	console.log("new BluetoothBLEInterfaceDevice");


   this.port_path = device.name;

   var NO_RESPONSE;
   var NO_START;
   var UNOTIME;

   
   var LOG = "[" + this.port_path + " random_object_identifier: " +  (Math.floor( Math.random() * 100) ) +  "] ";
   console.log(LOG + "Trying to register a new device...");
   var state = DEVICE_STATES["INITED"];

   var iDeviceID = -1;
   var iFirmwareVersion = -1;
   var sSerialNumber = "";
   var iSerialNumberOffset;
   var iWaiting = 0;
   var response = {};
   var commandToRun = null;
   var callback = null;
   var automaticStopCheckingSerialNumberTimeout;
   var isStopCheckingSerialNumber = false;
   var commands_stack = [];
   var time1 = Date.now();
   var time_delta = 0;
   var time2 = Date.now();
   var recieve_time1 =  Date.now();
   var recieve_time_delta = 0;
   var recieve_time2 =  Date.now();
   var isBluetoothDevice = true;
   var firmwareVersionDiffers = false;
   var old_command = '';
   var command_try_send_time1 = Date.now();
   var command_try_send_time2 = null;

   
   this.characteristicCache = null;


   var charactericsDictionary = {
      "23b74619-5ed0-4bf1-b982-364c343bdba4":null ,
      "31a685ee-c764-4098-80d8-d3064801dee7":null  

    }

    this.characteristicSerialNumber = null;

    this.commandsCharacteristic  = null;


     //callbacks
    var onErrorCb = () => {};
    var onFirmwareVersionDiffersCb =   () => {};
    var onDeviceStatusChangeCb = () => {};



    }



    function isN(n) {
      return (!isNaN(parseFloat(n)) && isFinite(n));
      // Метод isNaN пытается преобразовать переданный параметр в число.
      // Если параметр не может быть преобразован, возвращает true, иначе возвращает false.
      // isNaN("12") // false
   }


    var check_correct_serial = function(bufIncomingData){
      console.log("MAGII NET!");
     if(bufIncomingData[iSerialNumberOffset+5]  == '-' &&
        bufIncomingData[iSerialNumberOffset+11] == '-'  &&
        bufIncomingData[iSerialNumberOffset+17] == '-'  &&
        bufIncomingData[iSerialNumberOffset+19] == '-'  &&
        bufIncomingData[iSerialNumberOffset+25] == '-'  &&
        bufIncomingData[iSerialNumberOffset+31] == '-'  &&
        isN(bufIncomingData[iSerialNumberOffset+51]) == 1 &&
        isN(bufIncomingData[iSerialNumberOffset+20]) == 1 &&
        isN(bufIncomingData[iSerialNumberOffset+26]) == 1 &&
        isN(bufIncomingData[iSerialNumberOffset+32]) == 1 &&
        isN(bufIncomingData[iSerialNumberOffset+37]) == 1 &&
      isN(bufIncomingData[iSerialNumberOffset+42]) == 1 &&
      isN(bufIncomingData[iSerialNumberOffset+47]) == 1 )
        {
          console.log("data is" + bufIncomingData[iSerialNumberOffset+5] +
             bufIncomingData[iSerialNumberOffset+11] +
             bufIncomingData[iSerialNumberOffset+17] +
             bufIncomingData[iSerialNumberOffset+19] +
             bufIncomingData[iSerialNumberOffset+25] +
             bufIncomingData[iSerialNumberOffset+31] + " " +
             isN(bufIncomingData[iSerialNumberOffset+51]) + " " +
             isN(bufIncomingData[iSerialNumberOffset+20]) + " " +
             isN(bufIncomingData[iSerialNumberOffset+26]) + " " +
             isN(bufIncomingData[iSerialNumberOffset+32]) + " " +
             isN(bufIncomingData[iSerialNumberOffset+37]) + " " +
             isN(bufIncomingData[iSerialNumberOffset+42]) + " " +
             isN(bufIncomingData[iSerialNumberOffset+47] ));
             console.log(
               "data is:"+ bufIncomingData[iSerialNumberOffset+51] + " " +
                         bufIncomingData[iSerialNumberOffset+20] + " " +
                       bufIncomingData[iSerialNumberOffset+26] + " " +
                     bufIncomingData[iSerialNumberOffset+32] + " " +
                   bufIncomingData[iSerialNumberOffset+37] + " " +
                 bufIncomingData[iSerialNumberOffset+42] + " " +
               bufIncomingData[iSerialNumberOffset+47] )
          console.log("PROVERENO_MAXOM!");
          return 1;
        }
        console.log("data is" + bufIncomingData[iSerialNumberOffset+5] +
           bufIncomingData[iSerialNumberOffset+11] +
           bufIncomingData[iSerialNumberOffset+17] +
           bufIncomingData[iSerialNumberOffset+19] +
           bufIncomingData[iSerialNumberOffset+25] +
           bufIncomingData[iSerialNumberOffset+31] + " " +
           isN(bufIncomingData[iSerialNumberOffset+51]) + " " +
           isN(bufIncomingData[iSerialNumberOffset+20]) + " " +
           isN(bufIncomingData[iSerialNumberOffset+26]) + " " +
           isN(bufIncomingData[iSerialNumberOffset+32]) + " " +
           isN(bufIncomingData[iSerialNumberOffset+37]) + " " +
         isN(bufIncomingData[iSerialNumberOffset+42]) + " " +
       isN(bufIncomingData[iSerialNumberOffset+47]) );
        console.log("MAXY_NE_PONRAVILOS'!");
          return 0;
    }
 
    var checkSerialNumber = function(sIncomingData){
       console.log(LOG + "let's check the serial");
       console.log(LOG + "Now we have: " + sIncomingData);
       iSerialNumberOffset = sIncomingData.indexOf("ROBBO");
       console.log(sIncomingData.length + " doljna bit > chem " + (DEVICE_SERIAL_NUMBER_PROBE_INTERVAL+iSerialNumberOffset));
        if(sIncomingData.length > (DEVICE_SERIAL_NUMBER_PROBE_INTERVAL+iSerialNumberOffset)){
            if((iSerialNumberOffset < 0)||(!(check_correct_serial(sIncomingData)))){
             console.log(LOG + "Rubbish instead of serial number");
             state = DEVICE_STATES["DEVICE_IS_RUBBISH"];
             setTimeout(checkSerialNumber, 100);
            }
            else{
             iDeviceID        = parseInt(sIncomingData.substring(iSerialNumberOffset + 6, iSerialNumberOffset + 11));
             iFirmwareVersion = parseInt(sIncomingData.substring(iSerialNumberOffset + 12, iSerialNumberOffset + 17));
             sSerialNumber    = sIncomingData.substring(iSerialNumberOffset + 18, iSerialNumberOffset + DEVICE_SERIAL_NUMBER_LENGTH);
             console.warn(LOG + "Device=" + iDeviceID + " Firmware=" + iFirmwareVersion + " Serial='" + sSerialNumber + "'");
 
             if(last_firmwares[iDeviceID]!=iFirmwareVersion){
 
               console.error("BAD FLASH MF!!!");
               console.warn(last_firmwares[iDeviceID]+ "ot "+ iDeviceID + " = " + iFirmwareVersion + " lol");
 
               firmwareVersionDiffers = true;
 
              // clearTimeout(NO_START);
 
               if (onFirmwareVersionDiffersCb){
 
                 var result = {};
 
                     result.need_firmware = last_firmwares[iDeviceID];
                     result.current_device_firmware = iFirmwareVersion;
 
                   onFirmwareVersionDiffersCb(result);
 
               }
 
             }

             if ( (typeof(iDeviceID) != 'undefined') && (typeof(iFirmwareVersion) != 'undefined') && (typeof(sSerialNumber) != 'undefined') ){
               if ( (!isNaN(iDeviceID)) && (!isNaN(iFirmwareVersion)) && ( ( (sSerialNumber).startsWith("R") ) || ((sSerialNumber).startsWith("L")) ||((sSerialNumber).startsWith("O")) ||((sSerialNumber).startsWith("A")) ||((sSerialNumber).startsWith("E")) ) ) {
                      console.warn(LOG + "device is ready.");
                      state = DEVICE_STATES["DEVICE_IS_READY"];

                       
                      if (typeof(onDeviceStatusChangeCb) == 'function'){

                          let result = {

                              state:state,
                              deviceId: iDeviceID
                          }

                        onDeviceStatusChangeCb(result);

                  }

                       
                }
                else
                {console.error("bad data");}
              }
 
            }
         }else{

          state = DEVICE_STATES["DEVICE_ERROR"];

          if (onErrorCb){

            var error  = {};

               error.code = 2;
               error.msg = "Bad serial number";

              onErrorCb(error);

          }

          if (typeof(onDeviceStatusChangeCb) == 'function'){

               let error  = {};

               error.code = 2;
               error.msg = "Bad serial number";

               let result = {

                   state:state,
                   deviceId: iDeviceID,
                   error: error
               }

              onDeviceStatusChangeCb(result);

          }


         }
      
    }



    // Подключение к определенному устройству, получение сервиса и характеристики
    async function connectDeviceAndCacheCharacteristic(device,characteristicCache,charactericsDictionary) {
      if (device.gatt.connected && characteristicCache) {
        return Promise.resolve(characteristicCache);
      }

      console.log('Connecting to GATT server...');

      let server = await device.gatt.connect();
         
      console.log(LOG + 'GATT server connected, getting service...');

      state = DEVICE_STATES["CONNECTED"];

      if (typeof(onDeviceStatusChangeCb) == 'function'){

          let result = {

              state:state,
              deviceId: iDeviceID
          }

          onDeviceStatusChangeCb(result);

      }



      let service =  await server.getPrimaryService('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
        
         
      console.log('Service found, getting characteristic...');

            // return Promise.all([service.getCharacteristic('6f8ea403-3643-44e4-bbb4-d29555351bc8'),
            //                     service.getCharacteristic('31a685ee-c764-4098-80d8-d3064801dee7'),
            //                     service.getCharacteristic('23b74619-5ed0-4bf1-b982-364c343bdba4')
            //                   ])

      charactericsDictionary['31a685ee-c764-4098-80d8-d3064801dee7'] = await service.getCharacteristic('31a685ee-c764-4098-80d8-d3064801dee7');
      charactericsDictionary['23b74619-5ed0-4bf1-b982-364c343bdba4'] = await service.getCharacteristic('23b74619-5ed0-4bf1-b982-364c343bdba4');

      let characteristicSerialNumber = await service.getCharacteristic('6f8ea403-3643-44e4-bbb4-d29555351bc8');

      let commandsCharacteristic = await service.getCharacteristic('a30de044-d90b-4db9-a8bf-609fc9f5fa84');

          
          // then(characteristics => {
          //   console.log('Characteristics found');
          //   //characteristicCache = characteristic;

          //   characteristics.forEach(
          //     characteristic => {
          //       console.log(characteristic);
          //       if (characteristic.uuid != '6f8ea403-3643-44e4-bbb4-d29555351bc8'){
          //           charactericsDictionary[characteristic.uuid] = characteristic;

          //       }else{
          //           characteristicSerialNumber = characteristic;
          //       }

          //     }
          //   );

       characteristicCache = charactericsDictionary;



       return [characteristicCache, characteristicSerialNumber,commandsCharacteristic ];
        
    }

  


    function readSerialNumber(characteristicSerialNumber){

      characteristicSerialNumber.readValue().then(data_view => {
    
        let serialNumber = new TextDecoder().decode(data_view);
    
        if (serialNumber){
          console.warn(serialNumber);
        }

        checkSerialNumber(serialNumber);
    
      }).catch(err => console.error(err)); 
    
    }


    ///////////////////////
    // Start connecting 
    //
    ////////////////////////



   connectDeviceAndCacheCharacteristic(device,this.characteristicCache,charactericsDictionary).then(result => {

      [ this.characteristicCache, this.characteristicSerialNumber, this.commandsCharacteristic ]  = result;

      console.warn("this.characteristicCache");
      console.warn(this.characteristicCache);
  
      console.warn("this.characteristicSerialNumber");
      console.warn(this.characteristicSerialNumber);

      
      iWaiting = 0;
      commandToRun = null;

      state = DEVICE_STATES["DEVICE_CHECKING"];

      if (typeof(onDeviceStatusChangeCb) == 'function'){

          let result = {

              state:state,
              deviceId: iDeviceID
          }

          onDeviceStatusChangeCb(result);

      }


      readSerialNumber(this.characteristicSerialNumber);

   })





    ////////////////////////



    this.registerFirmwareVersionDiffersCallback = function(cb){

      if (typeof(cb) == 'function'){
   
           onFirmwareVersionDiffersCb = cb;
   
      }
   
   
    }
   
    this.registerErrorCallback = function(cb){
   
      if (typeof(cb) == 'function'){
   
           onErrorCb = cb;
   
      }
   
   
    }
   
    this.registerDeviceStatusChangeCallback = function(cb){
   
      if (typeof(cb) == 'function'){
   
           onDeviceStatusChangeCb = cb;
   
      }
   
   
    }
   
    this.isBluetoothDevice = function(){
   
       return isBluetoothDevice;
    }
   
    this.getRecieveTimeDelta = function(){
   
       return recieve_time_delta;
    }
   
      this.getState = function(){
         return state;
      }
   
      this.getDeviceID = function(){
         return iDeviceID;
      }
 
   
      this.getSerialNumber = function(){
   
           return sSerialNumber;
   
      }
   
      this.getShorterSerialNumber = function(){
   
        function countAllSubstrings(string,substring){
   
          var pos = -1;
          var entries_count = 0;
          while ((pos = string.indexOf(substring, pos + 1)) != -1) {
   
               entries_count++;
   
          }
   
          return entries_count;
   
        }
   
   
        var buf = "";
        var buf2 = "";
        var shorterSerialNumber = "";
        var index = 0;
        var defis_devider_count = 0;
   
       shorterSerialNumber = sSerialNumber.substring(0,1);
   
       buf = sSerialNumber.replace(shorterSerialNumber+"-","");
   
   
       defis_devider_count = countAllSubstrings(buf,"-");
   
   
       for (var i=0; i<=defis_devider_count; i++){
   
         while (buf.indexOf("-") == 0){
   
           buf = buf.replace("-","");
         }
   
   
         index = (i==defis_devider_count)?buf.length:buf.indexOf("-");
   
         buf2 =  buf.substring(0,index);
   
         buf =  buf.replace(buf2,"");
   
         while ((buf2.indexOf("0") == 0) && (buf2.length != 1)){
   
           buf2 = buf2.replace("0","");
         }
   
   
   
         shorterSerialNumber = shorterSerialNumber + "-" +  buf2;
   
       }
   
   
       return shorterSerialNumber;
   
   
      }
   
      this.getFirmwareVersion = function(){
   
   
         return iFirmwareVersion;
      }
  
     this.getPortName = function(){
        console.warn(this.port_path);
        return this.port_path;
     }


     this.isDeviceReady = function (){

         return (state ==  DEVICE_STATES["DEVICE_IS_READY"]);

     }


      this.isFirmwareVersionDiffers = function(){

          return firmwareVersionDiffers;
      } 

      this.isReadyToAcceptCommand = function (){

           return (commandToRun == null);

      }


     // Записать значение в характеристику
    this.writeToCommandsCharacteristic = function (data) {

      this.commandsCharacteristic.writeValue(data);

    }    


   this.command = function(command, params, fCallback){
    
    //Оптимизация. Пропускаем одну a команду, если она влезла в очередь между двумя c.
    //Актуально для последовательных блоков движения робота. 
  
     if ((command.code == "a") && (old_command == "c")){ 
  
       // console.warn("skip redundant a command");
        old_command = "a";
        return;
     }
  
  
      var fCallback = fCallback;
  
      var command_local = command;
      var params_local  = params;
  
      var should_kill_command = false;
  
      command_try_send_time2 = Date.now();
  
  
      if ((command != DEVICES[iDeviceID].commands.check) ){//Не буфферизуем команду a, так как она сыпется в канал в интервале 
  
            
  
           
  
             commands_stack.push({command:command,params:params,fCallback:fCallback,self:this});
  
           
             
  
  
          
  
          }//конец command != DEVICES[iDeviceID].commands.check
  
        
      
  
       
        if(commandToRun != null){// Завершаемся, если канал ещё занят
  
           return;
  
        }
  
  
          //commandToRun == null
         //can send new command
  
        if (commands_stack.length > 0){//берём из очереди команд, если она не пуста
  
  
  
  
  
            let command_object          =  commands_stack.shift();
  
            commandToRun                = command_object.command;
            command_local               = command_object.command; 
            params_local                = command_object.params; 
            fCallback                   = command_object.fCallback;
  
             if (commands_stack.length > 500){
  
                  commands_stack = [];
  
            }
  
           
  
  
        }else{
  
            commandToRun  = command;
            command_local = command;
            params_local  = params;
  
         }
  
        // commandToRun  = command;
        // command_local = command;
        // params_local  = params;
  
  
        command_try_send_time1 = Date.now();
  
       // bufIncomingData = new Uint8Array();
       
        const buf = Buffer.allocUnsafe(command_local.code.length + params_local.length + 1);
        
       var bufCommand = new TextEncoder("utf-8").encode(command_local.code);
       
        buf.writeUInt8(bufCommand, 0);
        
        var iParamOffset = 0;
         params_local.forEach(function(param){
           buf.writeUInt8(param, bufCommand.length + iParamOffset);
          
           iParamOffset++;
        });
        buf.writeUInt8(0x24, bufCommand.length + iParamOffset);
      
        this.writeToCommandsCharacteristic(buf);
       
  
  
      old_command = command_local.code;
  
  
        //for #
        var iWaitingNew = 1;
  
        //all params
        Object.keys(command_local.response).forEach(function (sField){
           switch(command_local.response[sField]){
              case "uint2":{
                 iWaitingNew += 2;
                 break;
              }
              case "ubyte[4]":{
                 iWaitingNew += 4;
                 break;
              }
              case "ubyte":{
                 iWaitingNew += 1;
                 break;
              }
           }
        });
  
        callback = fCallback;
  
      //  console.log(LOG + "we wating for " + iWaitingNew + " bytes");
        iWaiting = iWaitingNew;
     }

}


const searchBLEDevices = function(onDevicesFoundCb){

    // import_settings();
   
    //  arrDevices = [];
   
     console.warn("NO_RESPONSE_TIME = " + NO_RESPONSE_TIME);
     console.warn("NO_START_TIMEOUT = " + NO_START_TIMEOUT);
     console.warn("UNO_TIMEOUT = " + UNO_TIMEOUT);
     console.warn("DEVICE_HANDLE_TIMEOUT = " + DEVICE_HANDLE_TIMEOUT);
   
   
    var disconected_devices=0;
   
    var paired_devices = [];
   
    function getStatus(ignoreSettings) {
     console.warn("TRY TO GET STRAUS!");
     if (typeof navigator == "undefined") {
       console.error("Not running in a browser");
       return false;
     }
       console.warn("BLUETOOTH CHECK!");
     if (!navigator.bluetooth) {/*
       if (Espruino.Core.Utils.isChrome())
         return {error:`Chrome currently requires <code>chrome://flags/#enable-experimental-web-platform-features</code> to be enabled.`};
       else if (Espruino.Core.Utils.isFirefox())
         return {error:`Firefox doesn't support Web Serial - try using Chrome`};
       else*/
         console.error("No navigator.bluetooth. Do you have a supported browser?");
         return false;
     }
   
       console.warn("РАСКОМЕНТИТЬ ПРИ РАБОТЕ НА СЕРВЕРЕ!");
   /*  if (window && window.location && window.location.protocol=="http:" &&
         window.location.hostname!="localhost") {
       return {error:"Serving off HTTP (not HTTPS)"};
     }*//*
     if (!ignoreSettings && !Espruino.Config.WEB_SERIAL)
       return {warning:`"Web Serial" disabled in settings`};*/
       console.warn("STATUS TRUE!");
     return true;
   }
   
   function init() {
     console.warn("INITING!");
     // If we're ok and have the getDevices extension, use it to remember previously paired devices
     //console.warn(navigator.serial.getPorts);
    //  if (getStatus(true)===true && navigator.serial.getPorts) {
    //    console.log("Serial> serial.getPorts exists - grab known devices");
    //    navigator.serial.getPorts().then(devices=>{
    //      paired_devices
    //    });
    //  }
   }
   
        getStatus();
        init();
        
        var promise;
      
          console.warn("Bluetooth> Starting device chooser");
          promise = navigator.bluetooth.requestDevice({
            // filters: [/*{services: ['4fafc201-1fb5-459e-8fcc-c5c9c331914b']}*/],
            acceptAllDevices:true,
            optionalServices: ['4fafc201-1fb5-459e-8fcc-c5c9c331914b']
           });
   
          promise.then((bluetooth_device) => {

            console.warn(`bluetooth_device: ${bluetooth_device}`);
   
            console.warn(`bluetooth_device name: ${bluetooth_device.name}`);
   
            var device = new InterfaceDevice(bluetooth_device);
   
            arrDevices.push(device);
      
            if (typeof(onDevicesFoundCb) == 'function' ){
         
              onDevicesFoundCb(arrDevices);
         
            }
          
         })
   
   
       
   
       
   };

   const getConnectedBLEDevices = function(){

    return arrDevices;

}


   export  {

    InterfaceDevice,
    searchBLEDevices,
    getConnectedBLEDevices
  
  
  };