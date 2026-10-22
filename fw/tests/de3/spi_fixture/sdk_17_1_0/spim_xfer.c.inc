static nrfx_err_t spim_xfer(NRF_SPIM_Type               * p_spim,
                            spim_control_block_t        * p_cb,
                            nrfx_spim_xfer_desc_t const * p_xfer_desc,
                            uint32_t                      flags)
{
    nrfx_err_t err_code;
    // EasyDMA requires that transfer buffers are placed in Data RAM region;
    // signal error if they are not.
    if ((p_xfer_desc->p_tx_buffer != NULL && !nrfx_is_in_ram(p_xfer_desc->p_tx_buffer)) ||
        (p_xfer_desc->p_rx_buffer != NULL && !nrfx_is_in_ram(p_xfer_desc->p_rx_buffer)))
    {
        p_cb->transfer_in_progress = false;
        err_code = NRFX_ERROR_INVALID_ADDR;
        NRFX_LOG_WARNING("Function: %s, error code: %s.",
                         __func__,
                         NRFX_LOG_ERROR_STRING_GET(err_code));
        return err_code;
    }

#if NRFX_CHECK(NRFX_SPIM_NRF52_ANOMALY_109_WORKAROUND_ENABLED)
    p_cb->tx_length = 0;
    p_cb->rx_length = 0;
#endif

    nrf_spim_tx_buffer_set(p_spim, p_xfer_desc->p_tx_buffer, p_xfer_desc->tx_length);
    nrf_spim_rx_buffer_set(p_spim, p_xfer_desc->p_rx_buffer, p_xfer_desc->rx_length);

#if NRFX_CHECK(NRFX_SPIM3_NRF52840_ANOMALY_198_WORKAROUND_ENABLED)
    if (p_spim == NRF_SPIM3)
    {
        anomaly_198_enable(p_xfer_desc->p_tx_buffer, p_xfer_desc->tx_length);
    }
#endif

    nrf_spim_event_clear(p_spim, NRF_SPIM_EVENT_END);

    spim_list_enable_handle(p_spim, flags);

    if (!(flags & NRFX_SPIM_FLAG_HOLD_XFER))
    {
        nrf_spim_task_trigger(p_spim, NRF_SPIM_TASK_START);
    }
#if NRFX_CHECK(NRFX_SPIM_NRF52_ANOMALY_109_WORKAROUND_ENABLED)
    if (flags & NRFX_SPIM_FLAG_HOLD_XFER)
    {
        nrf_spim_event_clear(p_spim, NRF_SPIM_EVENT_STARTED);
        p_cb->tx_length = p_xfer_desc->tx_length;
        p_cb->rx_length = p_xfer_desc->rx_length;
        nrf_spim_tx_buffer_set(p_spim, p_xfer_desc->p_tx_buffer, 0);
        nrf_spim_rx_buffer_set(p_spim, p_xfer_desc->p_rx_buffer, 0);
        nrf_spim_int_enable(p_spim, NRF_SPIM_INT_STARTED_MASK);
    }
#endif

    if (!p_cb->handler)
    {
        while (!nrf_spim_event_check(p_spim, NRF_SPIM_EVENT_END)){}

#if NRFX_CHECK(NRFX_SPIM3_NRF52840_ANOMALY_198_WORKAROUND_ENABLED)
        if (p_spim == NRF_SPIM3)
        {
            anomaly_198_disable();
        }
#endif
        if (p_cb->ss_pin != NRFX_SPIM_PIN_NOT_USED)
        {
#if NRFX_CHECK(NRFX_SPIM_EXTENDED_ENABLED)
            if (!p_cb->use_hw_ss)
#endif
            {
                if (p_cb->ss_active_high)
                {
                    nrf_gpio_pin_clear(p_cb->ss_pin);
                }
                else
                {
                    nrf_gpio_pin_set(p_cb->ss_pin);
                }
            }
        }
    }
    else
    {
        spim_int_enable(p_spim, !(flags & NRFX_SPIM_FLAG_NO_XFER_EVT_HANDLER));
    }
    err_code = NRFX_SUCCESS;
    NRFX_LOG_INFO("Function: %s, error code: %s.", __func__, NRFX_LOG_ERROR_STRING_GET(err_code));
    return err_code;
}
