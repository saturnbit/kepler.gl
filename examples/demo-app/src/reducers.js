// Copyright (c) 2018 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import {combineReducers} from 'redux';
import {handleActions} from 'redux-actions';

import keplerGlReducer, {combineUpdaters} from 'kepler.gl/reducers';
import Processor from 'kepler.gl/processors';
import KeplerGlSchema from 'kepler.gl/schemas';

import {
  INIT,
  SET_LOADING_METHOD,
  LOAD_MAP_SAMPLE_FILE,
  LOAD_REMOTE_FILE_DATA_SUCCESS,
  SET_SAMPLE_LOADING_STATUS,
  SET_AUTH_TOKEN,
  PROPAGATE_STORAGE_EVENT,
  PUSHING_FILE
} from './actions';

import {DEFAULT_LOADING_METHOD, LOADING_METHODS} from './constants/default-settings';
import {retrieveAuthToken, validateAndStoreAuth} from './utils/auth-token';
import DropboxHandler from './utils/dropbox';

/**
 * Generate a hash string based on number of character
 * @param {number} count
 * @returns {string} hash string
 */
function generateHashId(count) {
  return Math.random()
    .toString(36)
    .substr(count);
}

// INITIAL_APP_STATE
const initialAppState = {
  appName: 'example',
  loaded: false,
  loadingMethod: DEFAULT_LOADING_METHOD,
  currentOption: DEFAULT_LOADING_METHOD.options[0],
  previousMethod: null,
  sampleMaps: [], // this is used to store sample maps fetch from a remote json file
  isMapLoading: false, // determine whether we are loading a sample map,
  authTokens: {
    // dropbox: '12345'
  },
  error: null // contains error when loading/retrieving data/configuration
    // {
    //   status: null,
    //   message: null
    // }
};

// Read auth tokens from localStorage
function readAuthTokens() {
  // we can add multiple handlers
  return [DropboxHandler].reduce((tokens, handler) => ({
    ...tokens,
    [handler.name]: retrieveAuthToken(DropboxHandler)
  }), {});
}

// App reducer
export const appReducer = handleActions({
  [INIT]: (state) => ({
    ...state,
    loaded: true
  }),
  [SET_LOADING_METHOD]: (state, action) => ({
    ...state,
    previousMethod: state.loadingMethod,
    loadingMethod: LOADING_METHODS.find(({id}) => id === action.method),
    error: null
  }),
  [LOAD_MAP_SAMPLE_FILE]: (state, action) => ({
    ...state,
    sampleMaps: action.samples
  }),
  [SET_SAMPLE_LOADING_STATUS]: (state, action) => ({
    ...state,
    isMapLoading: action.isMapLoading
  })
}, initialAppState);

const sharingInitialState = {
  authTokens: {
    // dropbox: '12345'
  },
  isLoading: false,
  status: null,
  info: null
};

// file upload reducer
export const sharingReducer = handleActions({
  [INIT]: (state) => ({
    ...state,
    authTokens: readAuthTokens()
  }),
  [LOAD_REMOTE_RESOURCE_ERROR]: (state, action) => ({
    ...state,
    error: action.error,
    currentOption: {dataUrl: action.url},
    isMapLoading: false
  }),
  [SET_AUTH_TOKEN]: state => {
    let token = validateAndStoreAuth(DropboxHandler);

    if (!token) {
      // TODO: show error
      return {
        ...state,
        error: 'AUTHENTICATION FAILED'
      }
    }
    return {
      ...state,
      authTokens: {
        ...state.authTokens,
        [DropboxHandler.name]: token
      }
    };
  },
  [PROPAGATE_STORAGE_EVENT]: state => ({
    ...state,
    authTokens: readAuthTokens()
  }),
  [PUSHING_FILE]: (state, action) => ({
    ...state,
    isLoading: action.isLoading,
    info: action.metadata
  })
}, sharingInitialState);

// combine app reducer and keplerGl reducer
// to mimic the reducer state of kepler.gl website
const demoReducer = combineReducers({
  // mount keplerGl reducer
  keplerGl: keplerGlReducer,
  app: appReducer,
  sharing: sharingReducer
});

// this can be moved into a action and call kepler.gl action
/**
 *
 * @param state
 * @param action {map: resultset, config, map}
 * @returns {{app: {isMapLoading: boolean}, keplerGl: {map: (state|*)}}}
 */
export const loadRemoteFileDataSuccess = (state, action) => {
  // TODO: replace generate with a different function
  const datasetId = action.options.id || generateHashId(6);
  const {dataUrl} = action.options;
  let processorMethod = Processor.processCsvData;
  // TODO: create helper to determine file ext eligibility
  if (dataUrl.includes('.json') || dataUrl.includes('.geojson')) {
    processorMethod = Processor.processGeojson;
  }

  const datasets = {
    info: {
      id: datasetId
    },
    data: processorMethod(action.response)
  };

  const config = action.config ?
    KeplerGlSchema.parseSavedConfig(action.config) : null;

  const keplerGlInstance = combineUpdaters.addDataToMapComposed(
    state.keplerGl.map, // "map" is the id of your kepler.gl instance
    {
      payload: {
        datasets,
        config
      }
    }
  );

  return {
    ...state,
    app: {
      ...state.app,
      isMapLoading: false // we turn of the spinner
    },
    keplerGl: {
      ...state.keplerGl, // in case you keep multiple instances
      map: keplerGlInstance
    }
  };
};

const composedUpdaters = {
  [LOAD_REMOTE_RESOURCE_SUCCESS]: loadRemoteFileDataSuccess
};

const composedReducer = (state, action) => {
  if (composedUpdaters[action.type]) {
    return composedUpdaters[action.type](state, action);
  }
  return demoReducer(state, action);
};

// export demoReducer to be combined in website app
export default composedReducer;
