package __PACKAGE__

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import java.util.concurrent.TimeUnit
import okhttp3.ConnectionPool
import okhttp3.OkHttpClient

/**
 * The HTTP client every request in the app goes through: React Native's own
 * networking (fetch, the chat's XHR stream) and expo/fetch (the cloud voices)
 * both build theirs from `OkHttpClientProvider`, so this is the one place to
 * make them hold up on a phone that moves between networks.
 *
 * Written by `plugins/withResilientOkHttp.js` on every prebuild. Edit it there.
 *
 * React Native's default has no timeouts and no keep-alive check, so a
 * connection that died without saying so (a Wi-Fi to mobile hand-over, a NAT
 * that forgot it) looked open forever: requests on it hung until the app was
 * restarted, and a reply streaming over it stopped mid-sentence. Two changes:
 *
 *  - A ping every 15 seconds on each HTTP/2 connection (the API speaks
 *    HTTP/2). A connection that does not answer one is closed, so a dead one
 *    fails within seconds and the app's own retry takes over. Quiet but live
 *    streams (a model thinking for a minute) are untouched: the ping is
 *    answered by the connection, not by the reply.
 *  - When the phone's default network changes, the idle connections made on
 *    the old one are dropped, so the next request opens a fresh one on the new
 *    network rather than trying a corpse first. One pool is shared by every
 *    client made here, so one eviction covers them all.
 *
 * Cookies and the disk cache are React Native's own (`createClientBuilder`),
 * which expo/fetch relies on: it casts the cookie jar to RN's container type.
 */
class ResilientOkHttpFactory(context: Context) : OkHttpClientFactory {
  private val appContext = context.applicationContext

  override fun createNewNetworkModuleClient(): OkHttpClient {
    watchDefaultNetwork(appContext)
    return OkHttpClientProvider.createClientBuilder(appContext)
      .connectionPool(pool)
      .pingInterval(PING_INTERVAL_SECONDS, TimeUnit.SECONDS)
      .retryOnConnectionFailure(true)
      .build()
  }

  companion object {
    private const val PING_INTERVAL_SECONDS = 15L

    private val pool = ConnectionPool(5, 5, TimeUnit.MINUTES)

    @Volatile private var watching = false

    @Synchronized
    private fun watchDefaultNetwork(context: Context) {
      if (watching) return
      val connectivity = context.getSystemService(ConnectivityManager::class.java) ?: return
      try {
        connectivity.registerDefaultNetworkCallback(
          object : ConnectivityManager.NetworkCallback() {
            private var current: Network? = null

            override fun onAvailable(network: Network) {
              val previous = current
              current = network
              if (previous != null && previous != network) pool.evictAll()
            }

            override fun onLost(network: Network) {
              if (network == current) {
                current = null
                pool.evictAll()
              }
            }
          },
        )
        watching = true
      } catch (error: RuntimeException) {
        // Too many callbacks registered, or no permission: the ping still
        // catches dead connections, only more slowly.
      }
    }
  }
}
