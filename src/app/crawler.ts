import { CrawlerOptions } from "../model/crawler-options";
import { CrawlerResources } from "../model/crawler-resources";
import { CrawlerDownloadInfo } from "../model/crawler-download-info";
import { CrawlerUrlInfo } from "../model/crawler-url-info";

import axios from "axios";
import * as cheerio from "cheerio";
import * as url from "url";

export class Crawler {

  /**
   * Crawl only default link resource if {CrawlerOptions} includeAssets is false
   *
   * @private
   * @type {CrawlerResources}
   */
  private readonly LINK_RESOURCE: CrawlerResources = {
    selector: 'a',
    attribute: 'href'
  }

  /**
   * Additional assets resource to be downloaded if {CrawlerOptions} includeAssets is true
   *
   * @private
   * @type {CrawlerResources[]}
   */
  private readonly ASSET_RESOURCES: CrawlerResources[] = [
    {
      selector: 'img',
      attribute: 'src'
    },
    {
      selector: 'script',
      attribute: 'src'
    },
    {
      selector: 'link[rel="stylesheet"]',
      attribute: 'href'
    }
  ];

  /**
   * Crawler default options. This can be overriden in the constructor
   *
   * @private
   * @type {CrawlerOptions}
   */
  private readonly CRAWLER_OPTIONS: CrawlerOptions = {
    maxDepth: 10,
    includeAssets: false
  }

  /**
   * Tracks the number of depth links it crawled
   *
   * @private
   * @type {number}
   */
  private currentDepth: number = 0;

  /**
   * Record the crawled page host
   *
   * @private
   * @type {string[]}
   */
  private scannedHosts: string[] = [];

  /**
   * Record the detailed information of scanned host
   *
   * @type {string[]}
   */
  public scannedResourceInfo: CrawlerDownloadInfo[] = [];

  /**
   * Create a reference of the main host
   *
   * @type {CrawlerUrlInfo}
   */
  public readonly PATH_INFO: CrawlerUrlInfo;

  /**
   * Main URL from the constructor
   *
   * @type {string}
   */
  public readonly URL: string;

  private readonly HOSTNAME: string;
  private readonly PROTOCOL: string;
  private readonly PORT: string;
  

  // DEBUG only
  private displayPathInfo = false;

  constructor(path: string, options?: CrawlerOptions) {

    const pathInfo = url.parse(path);

    if (this.displayPathInfo)
      console.log(pathInfo);

    if (pathInfo.hostname === null) {
      throw Error('Specified URL is invalid.');
    }

    /**
     * Sets the path information.
     * This will be used for links that contains ONLY path URL
     */
    this.URL      = path;
    this.HOSTNAME = pathInfo.hostname;
    this.PROTOCOL = pathInfo.protocol;
    this.PORT     = pathInfo.port;

    if (options) {
      this.CRAWLER_OPTIONS = Object.assign( this.CRAWLER_OPTIONS, options );
    }

  }

  /**
   * Fetches the content of the specified URL
   *
   * @param {string} url
   * @returns {Promise<any>}
   */
  async fetchPageContent(url: string): Promise<any> {
    const response: any = await axios.get(url).catch( (err) => {
      return err;
    });

    return response;
  }

  /**
   * Add protocol and host if curren url is empty
   *
   * @param {*} path
   * @returns {string}
   */
  cleanURL(path): string {
    if (!path) return;

    let hostname = this.HOSTNAME;
    let protocol = this.PROTOCOL;
    let port     = this.PORT;

    const pathInfo = url.parse(path);

    if (pathInfo.hostname) {
      hostname = pathInfo.hostname;
      protocol = pathInfo.protocol;
      port     = pathInfo.port;
    }

    return `${protocol}//${hostname}` + ( port ? port : '' ) + (pathInfo.pathname && pathInfo.pathname !== "/" ? pathInfo.pathname: "");
  }

  async readResourceContent(content, resources: CrawlerResources[], incrDepth?: boolean) {

    if (!resources) return;

    const cheerioInstance = cheerio.load(content);

    for (let i = 0; i < resources.length; i++ ) {
      const resource = resources[i];
      const selectors = cheerioInstance( resource.selector );

      if (selectors && selectors.length) {
        // selector lookup
        for (let j = 0; j < selectors.length; j++ ) {

          // STOP crawling if it reaches the max depth
          if (this.currentDepth === this.CRAWLER_OPTIONS.maxDepth) break;

          const path = cheerioInstance( selectors[j] ).attr( resource.attribute );

          if (path === "/") continue;

          const currentHost = this.cleanURL( path );

          if (currentHost && this.scannedHosts.includes(currentHost) === false) {
            this.scannedHosts.push(currentHost);

            if (incrDepth === true) {
              // INCREMENTS the depth when visiting the page
              this.currentDepth = this.currentDepth + 1;
            }

            const response = await this.fetchPageContent( currentHost );

            if ( this.isSuccessResponse(response) ) {

              const content = response.data;

              this.downloadScannedItem(content);

              // Record the crawled host
              this.scannedResourceInfo.push({
                resource: currentHost,
                size: +response.headers['content-length'] || Buffer.byteLength(content, 'utf8') || 0
              });

              if (this.currentDepth === 0 || this.currentDepth <= this.CRAWLER_OPTIONS.maxDepth) {
                await this.scanPage(response.data);
              }
            }
          }
        }
      }

    }
  }

  async scanPage(content) {

    if ( this.CRAWLER_OPTIONS.includeAssets === true) {
      await this.scanResourceAsset(content);
    }

    await this.scanResourceLink(content);
  }

  /**
   * Scan additional resources of the visite link
   *
   * @param {*} content
   * @returns {Promise<any>}
   * @memberof Crawler
   */
  async scanResourceAsset(content: any): Promise<any> {
    await this.readResourceContent( content, this.ASSET_RESOURCES, false );
  }

  /**
   * Scan only anchor tags and get the resource
   *
   * @param {*} content
   * @returns {Promise<any>}
   * @memberof Crawler
   */
  async scanResourceLink(content: any): Promise<any> {
    await this.readResourceContent( content, [this.LINK_RESOURCE], true );
  }

  /**
   *
   *
   * @param {*} response
   * @returns {boolean}
   */
  isSuccessResponse(response: any): boolean {
    return response && response.status >= 200 && response.status < 300;
  }

  /**
   * TODO: download content option
   *
   * @memberof Crawler
   */
  downloadScannedItem(content: string) {
    
  }

  /**
   * Initiates the crawling method
   */
  run(): Promise<CrawlerDownloadInfo[]> {

    return new Promise( resolve => {
      this.fetchPageContent(this.URL)
      .then( response => {
        if ( this.isSuccessResponse(response) ) {
          const content = response.data;

          this.scanPage( content ).then( () => {
            resolve(this.scannedResourceInfo);
            // Finish scanning
          });
        }
      });
    });
  }

}
